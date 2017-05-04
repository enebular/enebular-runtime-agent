#!/usr/bin/env python
import os
import logging
import sys
import re
import subprocess
import stat
from string import Template
import shutil
import click
import requests
import platform
import tempfile
from contextlib import contextmanager
from distutils.spawn import find_executable


logger = logging.getLogger('mbed-client-deploy')
PROG_NAME = os.path.basename(sys.argv[0])
CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])
MAKE_UTIL = 'mingw32-make.exe' if platform.system() == 'Windows' else 'make'
PATCH_UTIL = 'patch.exe' if platform.system() == 'Windows' else 'patch'


class Config(object):
    def __init__(self):
        self.verbose = False
        self.shallow = False
pass_config = click.make_pass_decorator(Config, ensure=True)


def del_rw(action, file_name, exc):
    if not os.access(file_name, os.W_OK):
        # Is the error an access error ?
        os.chmod(file_name, stat.S_IWUSR)
        action(file_name)
    else:
        raise


@contextmanager
def TemporaryDirectory():
    name = tempfile.mkdtemp()
    try:
        yield name
    finally:
        shutil.rmtree(name, onerror=del_rw)


def is_git_url(url):
    is_git = True
    try:
        cmd = ['git', 'ls-remote', url]
        logger.debug(" ".join(cmd))
        subprocess.check_call(cmd, stdout=open(os.devnull, 'w'), stderr=open(os.devnull, 'w'))
    except subprocess.CalledProcessError:
        is_git = False
    return is_git


class Repo(object):
    def __init__(self, config, repo_file):
        assert self.is_repo_file(repo_file), '{} is not a valid Repo file'.format(repo_file)
        self.config = config
        self.repo_file = repo_file
        try:
            with open(repo_file, 'rt') as fh:
                self.repo_data = fh.read().encode(encoding='utf-8', errors='strict').strip()
        except UnicodeDecodeError:
            if logger.isEnabledFor(logging.DEBUG):
                logger.exception('Failed to parse ' + repo_file)
        self.git_url, self.git_tree_ref = self.git_info_extract(self.repo_data)
        self.name = os.path.splitext(os.path.basename(repo_file))[0]
        self.repo_dir = os.path.join(os.path.dirname(repo_file), self.name)
        self.child_repos = []
        self.parent = None

    @staticmethod
    def git_info_extract(data):
        """
        Extract a (GIT_URL, GIT_TREE_REF) tuple from a string of the form <URL>#<REF>
        URL must in the form of <PROTOCOL>://host.xz/path/to/repo or git@github.com:path/to/repo
        REF can be any string representing a branch, tag or commit hash

        :param data: string
        :return: tuple
        """
        git_url, git_tree_ref = None, None
        is_github = b'github.com' in data
        if is_github:
            pattern = b'((file|git|ssh|http(s)?)|(git@github\.com))(:(//)?)(github\.com/)?([\w\.@\:/\-~]+)#?(\S*)'
        else:
            pattern = b'(file|git|ssh|http(s)?)(://)([\w\.@\:/\-~]+)#?(\S*)'
        match = re.search(pattern, data)
        if match:
            protocol = 'git@github.com:' if is_github else match.group(1).decode(encoding='utf-8') + '://'
            repo_path = match.group(match.lastindex - 1).decode(encoding='utf-8')
            # ugly patch when working on a repository fetched by mbed cli
            split_path = repo_path.split('/')
            if split_path[0] == 'git@github.com':
                repo_path = '/'.join(split_path[1:])
            git_url = protocol + repo_path.rstrip('/')

            git_tree_ref = match.group(match.lastindex).decode(encoding='utf-8')
            if git_tree_ref in ['latest', '']:
                git_tree_ref = 'master'

        return git_url, git_tree_ref

    @staticmethod
    def is_repo_file(path):
        if os.path.splitext(path)[1] not in ['.lib', '.ref']:  # repo files must end with .lib/.ref
            return False
        elif os.path.getsize(path) > 1024:  # repo files can't be large
            return False
        else:
            with open(path, 'rb') as f:  # repo files are only text files bigger than 0 bytes
                return b'\x00' not in f.read() and os.path.getsize(path) > 0

    def is_repo_dir_exist(self):
        return os.path.isdir(self.repo_dir) and os.path.isdir(os.path.join(self.repo_dir, '.git'))

    def git_fetch(self):
        is_hash = re.search('[a-fA-F0-9]{40}', self.git_tree_ref)
        refspecs = [
            'refs/heads/*:refs/remotes/origin/*',
            'refs/pull/*/head:refs/remotes/origin-pull/pull/*/head',
            'refs/pull/*/merge:refs/remotes/origin-pull/pull/*/merge'
        ]
        if not self.is_repo_dir_exist():
            logger.info('Cloning from {} to {}'.format(self.git_url, self.repo_dir))
            cmd = ['git', 'clone', '--progress', '--no-checkout', self.git_url, self.repo_dir]
            if not is_hash and self.config.shallow:
                cmd.append('--depth=1')
            logger.debug(" ".join(cmd))
            subprocess.check_call(cmd, cwd=os.path.dirname(self.repo_file), **self.config.stream_kwargs)
            cmd = ['git', 'fetch', '--tags', 'origin'] + refspecs
            logger.debug(" ".join(cmd))
            subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)
        else:
            cmd = ['git', 'ls-remote', '--get-url']
            logger.debug(" ".join(cmd))
            stream_kwargs = self.config.stream_kwargs.copy()
            stream_kwargs.pop('stdout', None)
            remote_repo = subprocess.check_output(cmd, cwd=self.repo_dir, **stream_kwargs)
            remote_url, _ = self.git_info_extract(remote_repo)
            assert self.git_url == remote_url, 'origin of %s is different from %s' % (self.repo_dir, self.repo_file)

            logger.info('{} already exists, updating from {}'.format(self.repo_dir, self.git_url))
            if self.config.force:
                cmd = ['git', 'checkout', '--', '.']
                logger.debug(" ".join(cmd))
                subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)
            if is_hash:
                cmd = ['git', 'fetch', '--tags', 'origin'] + refspecs
                logger.debug(" ".join(cmd))
                subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)
            else:
                cmd = ['git', 'pull', '--rebase', '--tags', '--all']
                logger.debug(" ".join(cmd))
                stream_kwargs = self.config.stream_kwargs.copy()
                stream_kwargs['stderr'] = subprocess.PIPE
                proc = subprocess.Popen(cmd, cwd=self.repo_dir, **stream_kwargs)
                outs, errs = proc.communicate()
                if proc.returncode:
                    logger.error(errs.strip().decode("utf-8"))
                    sys.exit(1)
        logger.info('Checking out from {} at {}'.format(self.git_url, self.git_tree_ref))
        cmd = ['git', 'config', 'advice.detachedHead', 'false']
        logger.debug(" ".join(cmd))
        subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)
        cmd = ['git', 'config', 'core.longpaths', 'true']
        logger.debug(" ".join(cmd))
        subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)
        cmd = ['git', 'checkout', self.git_tree_ref]
        logger.debug(" ".join(cmd))
        subprocess.check_call(cmd, cwd=self.repo_dir, **self.config.stream_kwargs)

    def is_excluded(self):
        exclude_mbed_os = 'mbed-os' in self.git_url and not self.config.fetch_mbed_os
        return exclude_mbed_os


class LibRepo(Repo):
    def __init__(self, config, repo_file):
        super(LibRepo, self).__init__(config, repo_file)
        assert b'github.com' in self.repo_data, '{} must point to a github repository!!'.format(self.repo_data)
        assert self.git_url
        assert self.git_tree_ref

    def fetch(self):
        self.git_fetch()


class RefRepo(Repo):
    def __init__(self, config, repo_file):
        super(RefRepo, self).__init__(config, repo_file)

    def fetch(self):
        if is_git_url(self.git_url):
                self.git_fetch()
        else:
            if os.path.isdir(self.repo_dir):
                logger.warning('Deleting %s', self.repo_dir)
                shutil.rmtree(self.repo_dir, onerror=del_rw)
            for line in self.repo_data.split():
                if os.path.isdir(line):  # Maybe it's a local folder
                    logger.info('Copying from local folder {} to {}'.format(line, self.repo_dir))
                    shutil.copytree(line, self.repo_dir)
                elif os.path.isfile(line):  # Or a local file
                    shutil.copy(line, self.repo_dir)
                else:  # Or a URL
                    if not os.path.exists(self.repo_dir):
                        os.mkdir(self.repo_dir)
                    logger.info('Downloading {} to {}'.format(line, self.repo_dir))
                    try :
                        self.download_file(line, self.repo_dir)
                    except Exception:
                         logger.info("***** Skipping git clone: " + line + " will use local copy *****")

    @staticmethod
    def download_file(url, dest_dir):
        assert (os.path.isdir(dest_dir)), '{} does not exist or not a directory'.format(dest_dir)
        local_filename = os.path.join(dest_dir, url.decode(encoding='utf-8').split('/')[-1])
        r = requests.get(url, stream=True)
        r.raise_for_status()
        with open(local_filename, 'wb') as f:
            shutil.copyfileobj(r.raw, f)
        return local_filename


class RepoFactory(object):
    @staticmethod
    def get_repo(config, repo_file):
        if os.path.splitext(repo_file)[1] == '.lib':
            repo = LibRepo(config, repo_file)
        else:
            repo = RefRepo(config, repo_file)

        return repo


class PalPlatform(object):
    REPO_NAME = 'pal-platform'
    PLAT_TYPES = ['SDK', 'OS', 'Device', 'Toolchain', 'Middleware']
    BUILD_SYS_MIN_VER = 2
    PLAT_CMAKE_TEMPLATE = '''
#################################################################################
#                                                                               #
#                        THIS IS AN AUTO GENERATED FILE                         #
#                                                                               #
#################################################################################

set (MBED_CLOUD_CLIENT_SDK $mbed_cloud_client_sdk)
set (MBED_CLOUD_CLIENT_OS $mbed_cloud_client_os)
set (MBED_CLOUD_CLIENT_DEVICE $mbed_cloud_client_device)
set (MBED_CLOUD_CLIENT_MIDDLEWARE $mbed_cloud_client_mw_list)
set (MBED_CLOUD_CLIENT_TOOLCHAIN $mbed_cloud_client_toolchain)
set (MBED_CLOUD_CLIENT_BUILD_SYS_MIN_VER $mbed_cloud_client_build_sys_min_ver)
'''

    class Platform:
        def __init__(self, config, plat_type, config_val, pal_plat_dir):
            assert plat_type in PalPlatform.PLAT_TYPES, '{} is not a valid platform type'.format(plat_type)
            assert(os.path.isdir(pal_plat_dir)), '{} does not exist or not a directory'.format(pal_plat_dir)
            self.type = plat_type
            self.type_dir = os.path.join(pal_plat_dir, plat_type)
            self.supported = self.get_supported(pal_plat_dir, plat_type)
            assert config_val in self.supported, \
                '{} ({}) is not supported, supported {}s are {}'.format(
                    plat_type, config_val, plat_type, str(self.supported)
                )
            self.name = config_val
            self.plat_dir = os.path.join(self.type_dir, self.name)
            repo_file = os.path.join(self.plat_dir, self.name + '.ref')
            self.repo = RefRepo(config, repo_file) if os.path.isfile(repo_file) else None
            self.patch_file = os.path.join(self.plat_dir, self.name + '.patch')

        @staticmethod
        def get_supported(pal_plat_dir, plat_type):
            type_dir = os.path.join(pal_plat_dir, plat_type)
            ret = filter(
                lambda path: os.path.isdir(os.path.join(type_dir, path)),
                os.listdir(str(type_dir))
            )
            return sorted(ret, key=str.lower)

        def fetch(self):
            if self.repo:
                if os.path.isfile(self.patch_file) and self.repo.is_repo_dir_exist():
                    PalPlatform.Platform.apply_patch(self.patch_file, reverse=True)
                self.repo.fetch()

        @staticmethod
        def apply_patch(patch_file, reverse=False):
            logger.info(
                '{} {}'.format('Reverting' if reverse else 'Applying', patch_file))
            _dir, filename = os.path.split(patch_file)

            with open(patch_file, 'rt') as fh:
                patch_source = fh.read()
            match = re.search(r'^--- (\S+)', patch_source, re.MULTILINE)
            if not match:
                raise Exception('malformed patch file')

            path_list = match.group(1).split('/')
            strip_num = path_list.index(os.path.splitext(filename)[0])
            logger.debug('patch file relative strip is {}'.format(strip_num))

            stream_kwargs = {'stdout': open(os.devnull, 'w'), 'stderr': open(os.devnull, 'w')}
            cmd = [PATCH_UTIL, '-p', str(strip_num), '-i', patch_file, '--binary']
            if logger.isEnabledFor(logging.DEBUG):
                cmd.append('--verbose')
                stream_kwargs = {'stderr': subprocess.STDOUT}
            else:
                cmd.append('--quiet')

            is_integrated = False
            try:
                full_cmd = cmd + ['--reverse', '--dry-run', '--force']
                logger.debug(" ".join(full_cmd))
                subprocess.check_call(full_cmd, cwd=_dir, **stream_kwargs)
                is_integrated = True
                logger.info(
                    '{} already integrated, {}'.format(patch_file, 'reverting' if reverse else 'no need to patch')
                )
            except subprocess.CalledProcessError:
                pass
            else:  # exception was not raised
                if reverse:
                    full_cmd = cmd + ['--reverse', '--force']
                    logger.debug(" ".join(full_cmd))
                    subprocess.check_call(full_cmd, cwd=_dir, **stream_kwargs)
                    is_integrated = False
                    logger.info('Successfully un-applied {} to {}'.format(patch_file, _dir))

            if not is_integrated and not reverse:
                try:
                    full_cmd = cmd + ['--dry-run']
                    logger.debug(" ".join(full_cmd))
                    subprocess.check_call(full_cmd, cwd=_dir, **stream_kwargs)

                    logger.debug(" ".join(cmd))
                    subprocess.check_call(cmd, cwd=_dir, **stream_kwargs)
                except subprocess.CalledProcessError:
                    logger.exception(
                        'Applying {} on {} failed, check that target directory is clean'.format(patch_file, _dir))
                    sys.exit(1)
                logger.info('Successfully applied {} to {}'.format(patch_file, _dir))
            return is_integrated

    def __init__(self, config, repo):
        self.config = config
        self.repo = repo
        self.verify_compatability()
        self.device = PalPlatform.Platform(
            config, 'Device', config.device, self.repo.repo_dir
        ) if hasattr(config, 'device') and config.device else None
        self.os = PalPlatform.Platform(
            config, 'OS', config.os, self.repo.repo_dir
        ) if hasattr(config, 'os') and config.os else None
        self.toolchain = PalPlatform.Platform(
            config, 'Toolchain', config.toolchain, self.repo.repo_dir
        ) if hasattr(config, 'toolchain') and config.toolchain else None
        self.sdk = PalPlatform.Platform(
            config, 'SDK', config.sdk, self.repo.repo_dir
        ) if hasattr(config, 'sdk') and config.sdk else None
        self.middleware = []
        if hasattr(config, 'mw_list'):
            self.middleware = [
                PalPlatform.Platform(config, 'Middleware', mw, self.repo.repo_dir) for mw in config.mw_list
            ]

    def fetch(self):
        for plat in filter(None, [self.device, self.os, self.toolchain, self.sdk] + self.middleware):
            plat.fetch()
            if plat.repo and os.path.isdir(plat.repo.repo_dir):
                _, new_repos = find_repos(plat.repo.repo_dir, self.config)
                for _repo in new_repos:
                    _repo.fetch()

    def apply_patches(self):
        for plat in filter(None, [self.device, self.os, self.toolchain, self.sdk] + self.middleware):
            if os.path.isfile(plat.patch_file):
                PalPlatform.Platform.apply_patch(plat.patch_file)

    def generate_plat_cmake(self):
        out_dir_name = '__'
        if self.sdk:
            out_dir_name += self.sdk.name
        else:
            out_dir_name += self.device.name + '_' + self.os.name
        parent_dir = os.path.normpath(os.path.join(self.repo.repo_dir, os.pardir))
        out_dir = os.path.join(parent_dir, out_dir_name)
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)
        autogen_file = os.path.join(out_dir, 'autogen.cmake')
        cmake_template = Template(PalPlatform.PLAT_CMAKE_TEMPLATE)
        with open(autogen_file, 'wt') as fh:
            fh.write(
                cmake_template.safe_substitute(
                    mbed_cloud_client_sdk=self.sdk.name if self.sdk else ' ',
                    mbed_cloud_client_os=self.os.name if self.os else ' ',
                    mbed_cloud_client_device=self.device.name if self.device else ' ',
                    mbed_cloud_client_mw_list=' '.join([mw.name for mw in self.middleware]),
                    mbed_cloud_client_toolchain=self.toolchain.name if self.toolchain else ' ',
                    mbed_cloud_client_build_sys_min_ver=PalPlatform.BUILD_SYS_MIN_VER,
                )
            )
        logger.info('Generated {}'.format(autogen_file))
        parent_cmake = os.path.join(parent_dir, 'CMakeLists.txt')
        if not os.path.isfile(os.path.join(parent_cmake)):
            with open(parent_cmake, 'wt') as fh:
                fh.write('ADDSUBDIRS()\n')
            logger.info('Generated {}'.format(parent_cmake))
        return out_dir

    def verify_compatability(self):
        with open(os.path.join(self.repo.repo_dir, 'mbedCloudClientCmake.txt'), 'rt') as fh:
            content = fh.read().encode(encoding='utf-8', errors='strict').strip()
        pattern = b'\s*set\s*\(\s*MBED_CLOUD_CLIENT_BUILD_SYS_MIN_VER_CMAKE\s*(\d)\s*\)'
        match = re.search(pattern, content)
        build_sys_ver = int(match.group(1))
        if PalPlatform.BUILD_SYS_MIN_VER != build_sys_ver:
            logger.error(
                'pal-platform build-sys-ver ({}) and tool\'s min-build-sys-ver ({}) are different'.format(
                    build_sys_ver, PalPlatform.BUILD_SYS_MIN_VER)
            )
            click.echo('{} only works with {} pal-platform tree, please update {}'.format(
                PROG_NAME,
                'newer' if PalPlatform.BUILD_SYS_MIN_VER > build_sys_ver else 'older',
                'pal-platform' if PalPlatform.BUILD_SYS_MIN_VER > build_sys_ver else PROG_NAME,
            )
            )
            sys.exit(1)

    def deploy(self):
        if not self.config.skip_update:
            self.fetch()
        self.apply_patches()
        out_dir = self.generate_plat_cmake()
        shutil.copy(
            os.path.join(self.repo.repo_dir, 'mbedCloudClientCmake.txt'),
            os.path.join(out_dir, 'CMakeLists.txt')
        )
        return out_dir

    @staticmethod
    def is_pal_platform_repo(repo):
        return repo.name == PalPlatform.REPO_NAME and PalPlatform.REPO_NAME in repo.git_url


@click.group(context_settings=CONTEXT_SETTINGS)
@click.option('-v', '--verbose', is_flag=True, help='Turn ON verbose mode')
@click.option(
    '--work-dir',
    type=click.Path(exists=True, resolve_path=True),
    default=os.curdir,
    help='Working directory (location of .lib/.ref files). Default is current working directory'
)
@click.version_option()
@pass_config
def cli(config, verbose, work_dir):
    config.verbose = verbose
    config.work_dir = work_dir
    config.stream_kwargs = {'stdout': open(os.devnull, 'w'), 'stderr': subprocess.STDOUT}

    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        stream=sys.stdout
    )
    if logger.isEnabledFor(logging.DEBUG):
        config.stream_kwargs = {}

    for program in [MAKE_UTIL, PATCH_UTIL]:
        if not find_executable(program):
            click.echo('{} is not in the PATH, please install or add to PATH'.format(program))
            raise click.Abort


@cli.command(
    context_settings=CONTEXT_SETTINGS,
    short_help='Deploy mbed-cloud-client files (run "{} deploy -h" for help)'.format(PROG_NAME)
)
@click.option(
    '--os',
    'plat_os',
    help='Type of embedded OS, for a list of supported OSs run "' + PROG_NAME + ' info"'
)
@click.option(
    '--device',
    help='Type of device, for a list of supported devices run "' + PROG_NAME + ' info"'
)
@click.option(
    '--mw',
    multiple=True,
    default=[],
    help='Type of middleware. Can be applied more than once for specifying multiple middlewares.\r\n'
         'For a list of supported middlewares run "' + PROG_NAME + ' info"'
)
@click.option(
    '--sdk',
    help='The platform\'s SDK, for a list of supported SDKs run "' + PROG_NAME + ' info"'
)
@click.option(
    '--toolchain',
    help='The toolchain to use, for a list of supported SDKs run "' + PROG_NAME + ' info"'
)
@click.option('-f', '--force', is_flag=True, help='Override local changes for existing Git repositories')
@click.option('--skip-update', is_flag=True, help='Skip Git Repositories update')
@click.option('--shallow', is_flag=True, help='Create a shallow clone of git repositories (To speed up deployment)')
@click.option('--fetch-mbed-os', is_flag=True, help='Allow fetching mbed-os from .lib file')
@pass_config
def deploy(config, plat_os, device, mw, sdk, toolchain, force, skip_update, shallow, fetch_mbed_os):
    """Deploy mbed-cloud-client files"""
    config.os = plat_os
    config.device = device
    config.mw_list = mw
    config.sdk = sdk
    config.toolchain = toolchain
    config.force = force
    config.skip_update = skip_update
    config.shallow = shallow
    config.fetch_mbed_os = fetch_mbed_os

    if not config.sdk:
        assert config.os and config.device, 'OS and Device are mandatory if SDK is not given'

    # scanning top down in order to remove pal-platform from iterations
    processed_repos = []
    (pal_plat, repos_to_fetch) = find_repos(config.work_dir, config)
    if not skip_update:
        while len(repos_to_fetch) > 0:
            repo = repos_to_fetch.pop(0)
            if (repo == pal_plat):
                if os.path.isdir(pal_plat.repo_dir):
                    continue
            processed_repos.append(repo)
            is_existing_repo = os.path.isdir(repo.repo_dir)
            if not repo.is_excluded():
                repo.fetch()
            if not is_existing_repo and not PalPlatform.is_pal_platform_repo(repo):
                new_pal_plat, new_repos = find_repos(repo.repo_dir, config)
                if new_pal_plat:
                    pal_plat = new_pal_plat
                for some_repo in new_repos:
                    is_found = False
                    for known_repo in processed_repos + repos_to_fetch:
                        if known_repo.repo_file == some_repo.repo_file:
                            is_found = True
                            break
                    if not is_found:
                        repos_to_fetch.append(some_repo)

    assert pal_plat, PalPlatform.REPO_NAME + ' repository not found!'

    if os.path.isdir(pal_plat.repo_dir):
        out_dir = PalPlatform(config, pal_plat).deploy()
        click.echo(click.style('Deployment is successful, please run cmake & make from {}'.format(out_dir), fg='green'))


def find_repos(dir, config):
    repos_to_fetch = []
    pal_plat = None
    for root, dirs, files in os.walk(dir, topdown=True):
        dirs[:] = [d for d in dirs if d != PalPlatform.REPO_NAME]
        for _file in files:
            full_path = os.path.join(root, _file)
            if Repo.is_repo_file(full_path):
                logger.debug('Found repo file - %s', full_path)
                repo = RepoFactory.get_repo(config, full_path)
                repos_to_fetch.append(repo)
                if PalPlatform.is_pal_platform_repo(repo):
                    # logger.debug('Found %s repo file - %s', PalPlatform.REPO_NAME, full_path)
                    pal_plat = repo
    return pal_plat, repos_to_fetch


@cli.command(context_settings=CONTEXT_SETTINGS)
@click.option(
    '-k', '--keep-repos', is_flag=True,
    help='Keep the deployed repositories (clean only cmake and build outputs)'
)
@pass_config
def clean(config, keep_repos):
    """Clean the working directory"""
    logger.info('Cleaning the working directory - {}'.format(config.work_dir))
    root_cmake_file = os.path.join(config.work_dir, 'CMakeLists.txt')
    to_delete = ['CMakeCache.txt', 'CMakeFiles', 'cmake_install.cmake', 'dummy.c',
                 'compilation_info.txt', 'Makefile', 'Release', 'Debug']
    deleted = []

    if keep_repos:
        # Run 'make clean' before anything else
        if os.path.exists(os.path.join(config.work_dir, 'Makefile')):
            cmd = [MAKE_UTIL, 'VERBOSE=1', 'clean']
            logger.debug(" ".join(cmd))
            subprocess.check_call(cmd, cwd=config.work_dir, **config.stream_kwargs)
    elif os.path.exists(root_cmake_file):
        deleted.append(root_cmake_file)

    for root, dirs, files in os.walk(config.work_dir):
        for _file in files:
            full_path = os.path.join(root, _file)
            if Repo.is_repo_file(full_path):
                repo = RepoFactory.get_repo(config, full_path)
                if os.path.isdir(repo.repo_dir):
                    if keep_repos:
                        for root, dirs, files in os.walk(repo.repo_dir):
                            folder = os.path.abspath(root)
                            _files = list(map((lambda _f: os.path.join(folder, _f)), files))
                            for _f in [f for f in _files if os.path.basename(f) in to_delete + ['CMakeLists.txt']]:
                                cmd = ['git', 'ls-files', os.path.basename(_f)]
                                logger.debug(" ".join(cmd))
                                outs = subprocess.check_output(cmd, cwd=root)
                                if outs:
                                    cmd = ['git', 'checkout', '--', os.path.basename(_f)]
                                    logger.debug(" ".join(cmd))
                                    subprocess.check_call(cmd, cwd=root, **config.stream_kwargs)
                                else:
                                    deleted.append(_f)
                    else:
                        deleted.append(repo.repo_dir)
            elif os.path.basename(_file) in to_delete:
                deleted.append(_file)

    for _file in deleted:
        if os.path.isdir(_file):
            logger.debug('Deleting directory {}'.format(_file))
            shutil.rmtree(_file, onerror=del_rw)
        elif os.path.isfile(_file):
            logger.debug('Deleting file {}'.format(_file))
            os.remove(_file)


@cli.command(context_settings=CONTEXT_SETTINGS)
@pass_config
def info(config):
    """Show information"""
    logger.setLevel(logging.ERROR)
    with TemporaryDirectory() as temp_dir:
        shutil.copy(os.path.join(config.work_dir, 'pal-platform.ref'), temp_dir)
        config.shallow = True
        repo = RefRepo(config, os.path.join(temp_dir, 'pal-platform.ref'))
        repo.git_fetch()
        pal_plat = PalPlatform(config, repo)

        for plat_type in pal_plat.PLAT_TYPES:
            supported = pal_plat.Platform.get_supported(pal_plat.repo.repo_dir, plat_type)
            click.echo('Supported {}s: {}'.format(plat_type, ', '.join(supported)))


if __name__ == '__main__':
    cli()
