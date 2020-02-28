// __mocks__/request.js

const request = jest.genMockFromModule('request').mockImplementation(async url => {
    console.log('aaaaaaaaaaaaaaaaaaaaa')
    return res
  });

// A custom version of `readdirSync` that reads from the special mocked out
// file list set via __setMockFiles


module.exports = request;