/**
 * Created by kvisnia on 3/25/17.
 */
const log4js = require('log4js')
const mongoAppender = require('log4js-node-mongodb')
const config = require('./config')

log4js.configure({
  appenders: [
    {
      type: 'file',
      filename: './logs/logs.log',
      category: 'general'
    },
    {
      type: 'file',
      filename: './logs/auth.log',
      category: 'login'
    },
    {
      type: 'file',
      filename: './logs/ldap.log',
      category: 'ldap'
    },
    {
      type: 'file',
      filename: './logs/error.log',
      category: 'error'
    },
    {
      type: 'file',
      filename: './logs/announcements.log',
      category: 'announcements'
    }
  ]
})

log4js.addAppender(
  mongoAppender.appender(
    {connectionString: config.MONGO[process.env.NODE_ENV]}),
  'general', 'login', 'ldap', 'error', 'announcements'
)

const loggerGeneral = log4js.getLogger('general')
const loggerLogin = log4js.getLogger('login')
const loggerLdap = log4js.getLogger('ldap')
const loggerError = log4js.getLogger('error')
const loggerAnnouncements = log4js.getLogger('announcements')

module.exports = {
  general: loggerGeneral,
  login: loggerLogin,
  ldap: loggerLdap,
  error: loggerError,
  announcements: loggerAnnouncements
}