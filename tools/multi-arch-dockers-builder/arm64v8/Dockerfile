FROM arm64v8/debian:stretch
 
COPY ./qemu-aarch64-static /usr/bin/qemu-aarch64-static

SHELL ["/usr/bin/qemu-aarch64-static", "-execve", "/bin/sh",  "-c"]
 
RUN apt-get update && apt-get install -y python git cmake python-pip build-essential wget
RUN pip install --upgrade pip setuptools
RUN pip install 'mbed-cli==1.10.1' 'click==7.0' 'requests>=2.0,<3.0'
RUN groupadd -g 1000 enebular && useradd -u 1000 -g 1000 -m enebular
RUN wget https://nodejs.org/dist/v12.22.10/node-v12.22.10-linux-arm64.tar.xz && tar xf node-v12.22.10-linux-arm64.tar.xz && mv node-v12.22.10-linux-arm64 /home/enebular/
RUN chown -R 1000:1000 /home/enebular/node-v12.22.10-linux-arm64
RUN echo "export PATH=\$PATH:/home/enebular/node-v12.22.10-linux-arm64/bin" > /home/enebular/.profile
RUN pip install 'colorama<0.5,>=0.3' 'Jinja2>=2.10.1,<2.11' 'pyYAML==4.2b1' 'mbed-ls>=1.5.1,<=1.8.4' 'mbed-host-tests>=1.4.4,<1.6' 'mbed-greentea>=0.2.24,<1.8' 'fuzzywuzzy==0.17.0' 'pyelftools>=0.24,<=0.25' 'jsonschema==2.6.0'
