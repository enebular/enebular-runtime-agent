FROM arm32v7/debian:stretch
 
COPY ./qemu-arm-static /usr/bin/qemu-arm-static

SHELL ["/usr/bin/qemu-arm-static", "-execve", "/bin/sh",  "-c"]
 
RUN apt-get update && apt-get install -y python git cmake python-pip build-essential wget
RUN pip install --upgrade pip setuptools
RUN groupadd -g 1000 enebular && useradd -u 1000 -g 1000 -m enebular
RUN wget https://nodejs.org/dist/v14.19.1/node-v14.19.1-linux-armv7l.tar.xz && tar xf node-v14.19.1-linux-armv7l.tar.xz && mv node-v14.19.1-linux-armv7l /home/enebular/
RUN chown -R 1000:1000 /home/enebular/node-v14.19.1-linux-armv7l
RUN echo "export PATH=\$PATH:/home/enebular/node-v14.19.1-linux-armv7l/bin" > /home/enebular/.profile
