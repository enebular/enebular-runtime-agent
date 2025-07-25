FROM arm64v8/debian:bookworm

COPY ./qemu-aarch64-static /usr/bin/qemu-aarch64-static

RUN apt-get update && apt-get install -y python3 git cmake python3-pip build-essential wget
RUN pip3 install --upgrade pip setuptools --break-system-packages
RUN groupadd -g 1000 enebular && useradd -u 1000 -g 1000 -m enebular
RUN wget https://nodejs.org/dist/v22.17.1/node-v22.17.1-linux-arm64.tar.xz && tar xf node-v22.17.1-linux-arm64.tar.xz && mv node-v22.17.1-linux-arm64 /home/enebular/
RUN chown -R 1000:1000 /home/enebular/node-v22.17.1-linux-arm64
RUN echo "export PATH=\$PATH:/home/enebular/node-v22.17.1-linux-arm64/bin" > /home/enebular/.profile