from __future__ import print_function
import os
import sys
import argparse
import boto3
from boto3 import Session
from botocore.exceptions import ClientError
import subprocess

def download_pub_key_from_s3(bucket_location,bucket_key,path):
    s3client = Session().client('s3')
    response = s3client.list_objects(
        Bucket=bucket_location,
        Prefix=bucket_key
    )
    if 'Contents' in response: #対象のキーが無い場合の処置
        keys = [content['Key'] for content in response['Contents']]
        for key in keys:
            base, ext = os.path.splitext(key)
            if ext == '.pub':
                dirname, filename = os.path.split(key)
                bucket = boto3.resource('s3').Bucket(bucket_location)
                bucket.download_file(key,path + filename )
                return True
    return False

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("bucket", help="Name of the existing S3 bucket location")
    parser.add_argument("bucket_key", help="Name of the S3 Bucket key")
    parser.add_argument("path", help="Name of the path")
    args = parser.parse_args()
    
    if not download_pub_key_from_s3(args.bucket,args.bucket_key,args.path):
        sys.exit(1)

if __name__ == "__main__":
    main()
