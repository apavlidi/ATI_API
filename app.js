const express = require('express')
const logger = require('morgan')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const config = require('./configs/config')
const compression = require('compression')
const path = require('path')
const announcements = require('./routes/bulletinBoard/announcements/index').router
const announcementFiles = require('./routes/bulletinBoard/announcementFiles/index').router
const categories = require('./routes/bulletinBoard/categories/index').router

const index = require('./routes/index')
const fileUpload = require('express-fileupload')

const app = express()
// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.use(logger('dev'))
app.use(bodyParser.json())
app.use(compression())   // Κανει compress ολα τα responses.Διαβασα οτι παντα πρεπει να γινεται compress στο response
app.use(bodyParser.urlencoded({extended: false}))
app.use(express.static(path.join(__dirname, 'public')))
app.use(fileUpload())

app.all('/*', function (req, res, next) {
  // CORS headers
  res.header('Access-Control-Allow-Origin', '*') // restrict it to the required domain
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS')
  // Set custom headers for CORS
  res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token')
  if (req.method == 'OPTIONS') {
    res.status(200).end()
  } else {
    next()
  }
})

app.use('/', index)
app.use('/announcements', announcements)
app.use('/categories', categories)
app.use('/files', announcementFiles)

app.io = require('socket.io')()

app.io.on('connection', function (socket) {
  console.log('a user connected')

  socket.on('disconnect', function () {
    console.log('user disconnected')
  })
})

mongoose.connect(config.MONGO[process.env.NODE_ENV], {
  connectTimeoutMS: 120000,
  socketTimeoutMS: 120000
})


//atch 404 and forward to error handler
app.use(function (req, res, next) {
  let err = new Error('Not Found')
  err.status = 404
  next(err)
})

// error handler
app.use(function (err, req, res) {
  console.log('EXPRESS ERROR HANDLING')
  console.log('εδώ εμφανίζουμε οτι θέλουμε στον τελικό χρήστη απο το object')
  // set locals, only providing error in development
  // res.locals.message = err.message
  // res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  if (err.text) {
    console.log(err)
    res.status(err.httpCode).json({
      error: {
        message: err.text,
        type: err.type,
        code: err.httpCode,
      }
    })
  } else {
    res.status(500).json({
      error: {
        message: 'Συνέβη κάποιο σφάλμα.',
        type: 'WrongEndPointError',
        code: '2000',
      }
    })
  }
})

module.exports = app
