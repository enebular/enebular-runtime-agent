# Awsiot-thing-creator

This is a tiny utility to create AWS IoT thing using aws-sdk

## Build
```sh
npm install
```

## Env

Supported environment variables:

```sh
ENV                              DESCRIPTION
AWS_ACCESS_KEY_ID                AWS access key ID
AWS_SECRET_ACCESS_KEY            AWS secret access key
AWS_IOT_REGION                   AWS IoT region
AWS_IOT_THING_NAME               The name of AWS IoT thing to be created
AWS_IOT_CONFIG_SAVE_PATH         The saving path of output config file       
```
## Example

To use the utility
```sh
AWS_IOT_THING_NAME=new-thing AWS_ACCESS_KEY_ID=<key-id> AWS_SECRET_ACCESS_KEY=<access-key> AWS_IOT_REGION=<region> npm start
```


