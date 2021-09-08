FROM node:12.22.5
 
RUN apt-get update && apt-get install -y python git cmake python-pip build-essential
RUN pip install --upgrade pip setuptools
RUN pip install 'mbed-cli==1.10.1' 'click==7.0' 'requests>=2.0,<3.0'
RUN pip install 'colorama<0.5,>=0.3' 'Jinja2>=2.10.1,<2.11' 'pyYAML==4.2b1' 'mbed-ls>=1.5.1,<1.8.4' 'mbed-host-tests>=1.4.4,<1.6' 'mbed-greentea>=0.2.24,<1.8' 'fuzzywuzzy==0.17.0' 'pyelftools>=0.24,<=0.25' 'jsonschema==2.6.0'
