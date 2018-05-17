
# enebular-agent - Enebular Activator

*Read this in other languages: [English](README-enebular-activator.md), [日本語](README-enebular-activator.ja.md)*

Use the enebular-activator module to support activation with enebular.

## Usage

The enebular-activator module can be enabled by specifying `enebular` for the `ACTIVATOR` environment variable when starting enebular-agent, as shown in the example below.

```
ACTIVATOR=enebular npm run start
```

## Configuration

The enebular-activator module requires a configuration file. Its path defaults to `.enebular-activation-config.json`, but a different path can be specified with the `ACTIVATOR_CONFIG_PATH` environment variable.

The configuration file should contain values for `enebularBaseURL` and `licenseKey`, as the example shows below.

```
{
	"enebularBaseURL": "https://enebular.com/api/v1",
	"licenseKey": "<KEY>"
}
```
