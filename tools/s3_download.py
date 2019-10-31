from __future__ import print_function
import os
import sys
import argparse
import boto3
from boto3 import Session
from botocore.exceptions import ClientError
import subprocess

def download_from_s3(bucket_location):
    s3client = Session().client('s3')
    response = s3client.list_objects(
        Bucket='enebular-world',
        Prefix='development/sign-key-pair/latest/'
    )
    if 'Contents' in response:  # 該当する key がないと response に 'Contents' が含まれない
        keys = [content['Key'] for content in response['Contents']]
        for key in keys:
            base, ext = os.path.splitext(key)
            if ext == '.pub':
                print(key)
                dirname, filename = os.path.split(base)
                bucket = boto3.resource('s3').Bucket('enebular-world')
                bucket.download_file(key,'agent/keys/enebular/' + filename )
                directory = os.listdir('/agent/keys/enebular')
                print(directory)
                return True
    return False

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("bucket", help="Name of the existing S3 bucket location")
    #parser.add_argument("bucket_key", help="Name of the S3 Bucket key")
    args = parser.parse_args()

    if not download_from_s3(args.bucket):
        sys.exit(1)

if __name__ == "__main__":
    main()
