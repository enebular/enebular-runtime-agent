let defaultDesired = {
    assets: {
        "5b6aef66-909e-4ae8-8174-ab140c372935" : {
            "updateId": "d8b121b9-dd3e-4deb-9df5-b052891f6cc5",
            "ts": 1582791873608,
            "config": {
                "name": "file-test-hara2",
                "type": "file",
                "fileTypeConfig": {
                    "src": "internal",
                    "internalSrcConfig": {
                    "stored": true,
                    "key": "8fd1e77a-b8d1-4c5b-b084-ede655daabd0"
                    },
                    "filename": "test_hara2.txt.txt",
                    "integrity": "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
                    "size": 4
            },
            "destPath": "test_hara"
            }
        }
    } 
}

let defaultReported = {
    assets: {
        assets: {
            "5b6aef66-909e-4ae8-8174-ab140c372935": {
                "updateId": "0f0c14af-5c9f-4831-8018-05dfc739472c",
                "state": "deployed",
                "config": {
                  "name": "file-test-hara2",
                  "type": "file",
                  "fileTypeConfig": {
                    "integrity": "n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgg=",
                    "internalSrcConfig": {
                      "key": "8fd1e77a-b8d1-4c5b-b084-ede655daabd0",
                      "stored": true
                    },
                    "filename": "test_hara2.txt.txt",
                    "size": 4,
                    "src": "internal"
                  },
                  "destPath": "test_hara"
                },
                "ts": 1583230604886
            }
        }
    }
}

export function desired(ptn) {
    let desiredObj = {}
    switch (ptn) {
        case 0: // default
            desiredObj = defaultDesired
        default:
            break;
    }
    return desiredObj;
}

export function reported(ptn) {
    let reportedObj = {}
    switch (ptn) {
        case 0: // default
            reportedObj = defaultReported
        default:
            break;
    }
    return reportedObj;
}
