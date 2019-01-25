const path = require('path')
const express = require('express')
const app = express()
const port = 3000

app.get('/install', (req, res) => {
    res.sendFile(path.resolve('../../install.sh'))
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
