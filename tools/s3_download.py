from __future__ import print_function
import os
import sys
import argparse
import boto3
from botocore.exceptions import ClientError
import subprocess

def download_from_s3(bucket_location):
    print("bucket_location:",bucket_location)
    #print("bucket_key:",bucket_key)
    s3 = boto3.resource('s3')

    bucket = s3.Bucket('enebular-world')
    #objects = bucket.objects.all()
    #for a_object in objects:
    #    print(a_object)
    path = bucket_location + '/enebular-runtime-agent/agent/keys/enebular/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub'
    bucket.download_file('development/sign-key-pair/latest/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub',path )
    f = open(path)
    print(f.read())
    f.close()
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
