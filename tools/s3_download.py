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
    bucket.download_file('development/sign-key-pair/latest/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub', '../agent/keys/enebular/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub')
    f = open('../agent/keys/enebular/5b1001a0-f2b8-4098-84be-1d7254a6ce70.pub')
    data1 = f.read()  # ファイル終端まで全て読んだデータを返す
    f.close()
    lines1 = data1.split('\n') # 改行で区切る(改行文字そのものは戻り値のデータには含まれない)
    for line in lines1:
        print line
    print
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
