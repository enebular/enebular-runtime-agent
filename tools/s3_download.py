from __future__ import print_function
import os
import sys
import argparse
import boto3
from boto3 import Session
from botocore.exceptions import ClientError
import subprocess

def download_from_s3(bucket_location):
    print("bucket_location:",bucket_location)
    #print("bucket_key:",bucket_key)
    s3 = boto3.resource('s3')
    s3client = Session().client('s3')

    bucket = s3.Bucket('enebular-world')
    response = s3client.list_objects(
        Bucket='enebular-world',
        Prefix='development/sign-key-pair/latest/'
    )
    if 'Contents' in response:  # 該当する key がないと response に 'Contents' が含まれない
        keys = [content['Key'] for content in response['Contents']]
    # objects = bucket.objects.all()
    for a_object in keys:
        print(a_object)
    bucket.download_file('development/sign-key-pair/latest/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub','agent/keys/enebular/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub' )
    f = open('agent/keys/enebular/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub')
    print(f.read())
    f.close()
    directory = os.listdir(bucket_location + '/agent/keys/enebular')
    print(directory)
    return True

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("bucket", help="Name of the existing S3 bucket location")
    #parser.add_argument("bucket_key", help="Name of the S3 Bucket key")
    args = parser.parse_args()

    if not download_from_s3(args.bucket):
        sys.exit(1)

if __name__ == "__main__":
    main()
