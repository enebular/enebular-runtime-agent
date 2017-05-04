#!/usr/bin/env python

from os import path
import hashlib, zlib, struct
import time

'''
define FIRMWARE_HEADER_MAGIC   0x5a51b3d4UL
define FIRMWARE_HEADER_VERSION 1
typedef struct FirmwareHeader {
    uint32_t magic;                         /** Metadata-header specific magic code */
    uint32_t version;                       /** Revision number for this generic metadata header. */
    uint32_t checksum;                      /** A checksum of this header. This field should be considered to be zeroed out for
                                             *  the sake of computing the checksum. */
    uint32_t totalSize;                     /** Total space (in bytes) occupied by the firmware BLOB. */
    uint64_t firmwareVersion;               /** Version number for the accompanying firmware. Larger numbers imply more preferred (recent)
                                             *  versions. This defines the selection order when multiple versions are available. */
    uint8_t  firmwareSHA256[SIZEOF_SHA256]; /** A SHA-2 using a block-size of 256-bits of the firmware, including any firmware-padding. */
} FirmwareHeader_t;
'''

# define defaults to go into the metadata header
SIZEOF_SHA256 = 256/8
FIRMWARE_HEADER_MAGIC = 0x5a51b3d4
FIRMWARE_HEADER_VERSION = 1
FirmwareHeader_t = "4IQ{}s".format(SIZEOF_SHA256) # 4*unsigned int, 1*unsigned long long, 1*bytes

def create_header(app_blob, firmwareVersion):
    # calculate the hash of the application
    firmwareSHA256 = hashlib.sha256(app_blob)

    # calculate the total size which is defined as the application size + metadata header
    totalSize = len(app_blob)

    print ('imageSize:    {}'.format(totalSize))
    print ('imageHash:    {}'.format(''.join(['{:0>2x}'.format(ord(c)) for c in firmwareSHA256.digest()])))
    print ('imageversion: {}'.format(firmwareVersion))

    # set checksum to zero and calculate the checksum of the header
    checksum = 0
    FirmwareHeader = struct.pack(FirmwareHeader_t,
                                    FIRMWARE_HEADER_MAGIC,
                                    FIRMWARE_HEADER_VERSION,
                                    checksum,
                                    totalSize,
                                    firmwareVersion,
                                    firmwareSHA256.digest())
    checksum = zlib.crc32(FirmwareHeader) & 0xffffffff

    # Pack the data into a binary blob
    FirmwareHeader = struct.pack(FirmwareHeader_t,
                                    FIRMWARE_HEADER_MAGIC,
                                    FIRMWARE_HEADER_VERSION,
                                    checksum,
                                    totalSize,
                                    firmwareVersion,
                                    firmwareSHA256.digest())

    return FirmwareHeader


def combine(bootloader_blob, app_blob, app_offset, hdr_offset, output, version):

    # create header to go with the application binary
    FirmwareHeader = create_header(app_blob, version)

    # write the bootloader first
    offset = 0
    output.write(bootloader_blob)
    offset += len(bootloader_blob)

    # write the padding between bootloader and firmware header
    output.write(b'\00' * (hdr_offset - offset))
    offset += (hdr_offset - offset)

    # write firmware header
    output.write(FirmwareHeader)
    offset += len(FirmwareHeader)

    # write padding between header and application
    output.write(b'\00' * (app_offset - offset))

    # write the application
    output.write(app_blob)


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(
        description='Combine bootloader with application adding metadata header.')

    def offset_arg(s):
        if s.startswith('0x'):
            return int(s, 16)
        else:
            return int(s)

    # specify arguments
    parser.add_argument('-b', '--bootloader',    type=argparse.FileType('rb'), required=True,
                        help='path to the bootloader binary')
    parser.add_argument('-a', '--app',           type=argparse.FileType('rb'), required=True,
                        help='path to application binary')
    parser.add_argument('-c', '--app-offset',    type=offset_arg,              required=True,
                        help='offset of the application')
    parser.add_argument('-d', '--header-offset', type=offset_arg,              required=True,
                        help='offset of the firmware metadata header')
    parser.add_argument('-o', '--output',        type=argparse.FileType('wb'), required=True,
                        help='output combined file path')
    parser.add_argument('-s', '--set-version',   type=int,                     required=False,
                        help='set version number', default=int(time.time()))

    # workaround for http://bugs.python.org/issue9694
    parser._optionals.title = "arguments"

    # get and validate arguments
    args = parser.parse_args()

    # read the contents of bootloader and application binaries into buffers
    bootloader_blob = args.bootloader.read()
    args.bootloader.close()
    app_blob = args.app.read()
    args.app.close()

    # combine applicaiton and bootloader adding metadata info
    combine(bootloader_blob, app_blob, args.app_offset, args.header_offset, args.output, args.set_version)

    # close output file
    output_fn = path.abspath(args.output.name)
    args.output.close()

    # print the output file path
    print 'Combined binary:', output_fn
