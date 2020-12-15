FROM arm32v7/debian:stretch
 
COPY ./qemu-arm-static /usr/bin/qemu-arm-static

SHELL ["/usr/bin/qemu-arm-static", "-execve", "/bin/sh",  "-c"]
 
RUN apt-get update && apt-get install -y python git cmake python-pip build-essential wget
RUN pip install 'mbed-cli==1.10.1' 'click==7.0' 'requests>=2.0,<3.0'
RUN groupadd -g 1000 enebular && useradd -u 1000 -g 1000 -m enebular
RUN wget https://nodejs.org/dist/v12.20.0/node-v12.20.0-linux-armv7l.tar.xz && tar xf node-v12.20.0-linux-armv7l.tar.xz && mv node-v12.20.0-linux-armv7l /home/enebular/
RUN chown -R 1000:1000 /home/enebular/node-v12.20.0-linux-armv7l
RUN echo "export PATH=\$PATH:/home/enebular/node-v12.20.0-linux-armv7l/bin" > /home/enebular/.profile
RUN pip install 'colorama<0.5,>=0.3' 'Jinja2>=2.10.1,<2.11' 'pyYAML==4.2b1' 'mbed-ls>=1.5.1,<1.8' 'mbed-host-tests>=1.4.4,<1.6' 'mbed-greentea>=0.2.24,<1.8' 'fuzzywuzzy==0.17.0' 'pyelftools>=0.24,<=0.25' 'jsonschema==2.6.0'

