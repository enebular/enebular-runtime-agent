export function desired(ptn) {
    let desiredObj = {}
    switch (ptn) {
        case 0: // File Deploy normal
            desiredObj = {
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
        default:
            break;
    }
    return desiredObj;
}
  