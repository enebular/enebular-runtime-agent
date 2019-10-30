from __future__ import print_function
import os
import sys
import argparse
import boto3
from botocore.exceptions import ClientError

def download_from_s3(bucket_location):
    print("bucket_location:",bucket_location)
#    print("bucket_key:",bucket_key)
    s3 = boto3.resource('s3')

    bucket = s3.Bucket('development')
    objects = bucket.objects.all()
    for a_object in objects:
        print(a_object)
    # bucket.download_file('fuga.txt', 'fuga.txt')
    return True

def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("bucket", help="Name of the existing S3 bucket location")
#    parser.add_argument("bucket_key", help="Name of the S3 Bucket key")
    args = parser.parse_args()

    if not download_from_s3(args.bucket):
        sys.exit(1)

if __name__ == "__main__":
    main()
