
jest.mock('fs');


describe('listFilesInDirectorySync', () => {

  const MOCK_FILE_INFO = {
    '/path/to/file1.js': 'console.log("file1 contents");',
    '/path/to/file2.txt': 'file2 contents',
  };

  beforeEach(() => {
    // Set up some mocked out file info before each test
    require('fs').__setMockFiles(MOCK_FILE_INFO);
  });

  test('includes all files in the directory in the summary', () => {
    let directory = '/path/to'
    const fileSummary = require('fs').readdirSync(directory).map(fileName => ({
        directory,
        fileName,
    }))

    expect(fileSummary.length).toBe(2);
  });
});