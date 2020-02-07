FROM arm32v7/debian:stretch
 
COPY ./qemu-arm-static /usr/bin/qemu-arm-static

SHELL ["/usr/bin/qemu-arm-static", "-execve", "/bin/sh",  "-c"]
 
RUN apt-get update && apt-get install -y python git cmake python-pip build-essential wget
RUN pip install mbed-cli click requests
RUN groupadd -g 1000 enebular && useradd -u 1000 -g 1000 -m enebular
RUN wget https://nodejs.org/dist/v12.14.0/node-v12.14.0-linux-armv7l.tar.xz && tar xf node-v12.14.0-linux-armv7l.tar.xz && mv node-v12.14.0-linux-armv7l /home/enebular/
RUN chown -R 1000:1000 /home/enebular/node-v12.14.0-linux-armv7l
RUN echo "export PATH=\$PATH:/home/enebular/node-v12.14.0-linux-armv7l/bin" > /home/enebular/.profile
RUN pip install colorama PySerial PrettyTable Jinja2 IntelHex junit-xml pyYAML requests mbed-ls mbed-host-tests mbed-greentea beautifulsoup4 fuzzywuzzy pyelftools jsonschema future
