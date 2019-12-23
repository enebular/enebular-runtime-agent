# awsiot-thing-creator

This is a tiny utility to create a AWS IoT thing using aws-sdk.

It does the following:

1. Creates the keys and certificates for a new thing
2. Creates a standard policy for the new thing (if it doesn't exist already)
3. Attaches the standard policy to the new certificate
4. Creates a new thing and attaches the new certificate

## Building

```sh
npm install
```

## Environment Variables

Supported environment variables:

```sh
ENV                              DESCRIPTION
AWS_ACCESS_KEY_ID                AWS access key ID
AWS_SECRET_ACCESS_KEY            AWS secret access key
AWS_IOT_REGION                   AWS IoT region
AWS_IOT_THING_NAME               The name of the AWS IoT thing to be created
AWS_IOT_CONFIG_SAVE_PATH         The path of the generated config file       
```

## Example

This is an example of using the utility.

```sh
AWS_IOT_THING_NAME=new-thing AWS_ACCESS_KEY_ID=<key-id> AWS_SECRET_ACCESS_KEY=<access-key> AWS_IOT_REGION=<region> npm start
```
