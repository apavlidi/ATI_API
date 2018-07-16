const Feed = require('feed')
const async = require('async')
const mongoose = require('mongoose')
const database = require('../../../configs/database')
const fileChecks = require('./fileChecks')
const wordpress = require('wordpress')
const WORDPRESS_CREDENTIALS = require('../../../configs/config').WORDPRESS_CREDENTIALS
const WEB_BASE_URL = require('../../../configs/config').WEB_BASE_URL
const MAIL = require('../../../configs/config').MAIL
const ldapConfig = require('../../../configs/config')
const ldap = require('ldapjs')
const filter = require('ldap-filters')
const sendPush = require('./sendPush')
const ApplicationErrorClass = require('../../applicationErrorClass')
const apiFunctions = require('../../apiFunctions')

const clientWordpress = wordpress.createClient(WORDPRESS_CREDENTIALS)
const client = ldap.createClient({
  url: ldapConfig.LDAP[process.env.NODE_ENV].host
})

function getDescriptionRSSLogged (rssCategories) {
  let descriptionRSS
  if (rssCategories) {
    descriptionRSS = 'Ανακοινώσεις για τις παρακάτω κατηγορίες: '
    rssCategories.forEach(category => {
      descriptionRSS += category.name + ', '
    })
    descriptionRSS = descriptionRSS.substr(0, descriptionRSS.lastIndexOf(','))
  }
  return descriptionRSS
}

function getDescriptionRSSDependOnLogged (isAuthenticated) {
  return isAuthenticated ? 'Όλες οι ανακοινώσεις' : 'Όλες οι δημόσιες ανακοινώσεις'
}

function createFeedObj (description) {
  return new Feed({
    title: 'Τμήμα Πληροφορικής - Ανακοινώσεις',
    id: 'https://apps.it.teithe.gr/',
    description: description,
    generator: 'Feed for Apps',
    link: 'https://apps.it.teithe.gr/announcements',
    copyright: 'All rights reserved 2017, Alexis Pavlidis',
    feedLinks: {
      atom: '/api/announcements/feed/atom',
      rss: 'https://apps.it.teithe.gr/api/announcements/feed/rss'
    },
    author: {
      name: 'Alexis Pavlidis'
    }
  })
}

function appendPostsToFeed (feed, posts) {
  return new Promise(
    function (resolve, reject) {
      let calls = []

      posts.forEach(function (announcement) {
        calls.push(function (callback) {
          feed.addItem({
            title: announcement.title,
            description: announcement._about.name,
            link: 'https://apps.it.teithe.gr/announcements/' + announcement._id,
            id: 'https://apps.it.teithe.gr/announcements/' + announcement._id,
            content: announcement.text,
            author: [{
              name: announcement.publisher.name
            }],
            contributor: [],
            date: announcement.date
          })
          callback(null)
        })
      })
      async.parallel(calls, function (err) {
        resolve()
      })

    })
}

function getAnnouncementsRSSPromise (announcements, rssCategories, categoryValues, feedType, res, isAuthenticated) {
  return new Promise(
    function (resolve, reject) {
      let descriptionRSS
      categoryValues ? descriptionRSS = getDescriptionRSSLogged(rssCategories) : descriptionRSS = getDescriptionRSSDependOnLogged(isAuthenticated)
      let feed = createFeedObj(descriptionRSS)

      appendPostsToFeed(feed, announcements).then(function () {
        let response
        switch (feedType) {
          case 'rss':
            res.set('Content-Type', 'text/xml')
            response = feed.rss2()
            break
          case 'json' :
            res.setHeader('Content-Type', 'application/json')
            response = feed.json1()
            break
          default:
            res.set('Content-Type', 'text/plain')
            response = feed.atom1()
        }
        resolve(response)
      })

      // announcements.forEach(function (announcement) {
      //   calls.push(function (callback) {
      //     feed.addItem({
      //       title: announcement.title,
      //       description: announcement._about.name,
      //       link: 'https://apps.it.teithe.gr/announcements/announcement/' + announcement._id,
      //       id: 'https://apps.it.teithe.gr/announcements/announcement/' + announcement._id,
      //       content: announcement.text,
      //       author: [{
      //         name: announcement.publisher.name
      //       }],
      //       contributor: [],
      //       date: announcement.date
      //     })
      //     callback(null)
      //   })
      // })
      //
      // async.parallel(calls, function (err) {
      //   if (err) {
      //     reject(err)
      //   }
      //   let response
      //   switch (feedType) {
      //     case 'rss':
      //       res.set('Content-Type', 'text/xml')
      //       response = feed.rss2()
      //       break
      //     case 'json' :
      //       res.setHeader('Content-Type', 'application/json')
      //       response = feed.json1()
      //       break
      //     default:
      //       res.set('Content-Type', 'text/plain')
      //       response = feed.atom1()
      //   }
      //   resolve(response)
      // })
    })
}

function validatePublisher (publisherId) {
  return new Promise(
    function (resolve, reject) {
      // request.get({
      //   url: WEB_BASE_URL.url + '/api/user/all/' + publisherId,
      //   agentOptions: {rejectUnauthorized: false}
      // }, function (error, response, body) {
      //   if (error) {
      //     resolve(false);
      //   }
      //   else {
      //     let parsed = JSON.parse(body);
      //     if (parsed && parsed.length === 0) {
      //       resolve(false);
      //     } else {
      //       resolve(true);
      //     }
      //   }
      // });
      resolve(true)
    })
}

function createFileEntries (files, announcementId) {
  return new Promise(
    function (resolve, reject) {
      let calls = []
      let filesIds = []

      files.forEach(function (file) {
        calls.push(function (callback) {
          let fileId = mongoose.Types.ObjectId()
          let newFile = new database.File({
            name: file.name,
            _id: fileId,
            contentType: file.mimetype,
            data: file.data,
            _announcement: announcementId
          })
          newFile.save(function (err, newFile) {
            if (err) {
              reject(new ApplicationErrorClass(null, null, 105, err, null, null, 500))
            } else {
              filesIds.push(newFile._id)
              callback(null)
            }
          })
        })
      })

      async.parallel(calls, function (err) {
        if (err) {
          reject(new ApplicationErrorClass(null, null, 106, err, null, null, 500))
        }
        resolve(filesIds)
      })
    })
}

function checkIfEntryExists (entryId, collection) {
  return new Promise(
    function (resolve, reject) {
      collection.findOne({_id: entryId}, function (err, doc) {
        if (err || !doc) {
          reject(new ApplicationErrorClass(null, null, 104, err, null, null, 500))
        } else {
          resolve(doc)
        }
      })
    })
}

function gatherFilesInput (filesInput) {
  return new Promise(
    function (resolve, reject) {
      let files = []
      if (filesInput) {
        let upload = filesInput
        if (Array.isArray(upload)) { // if multiple files are uploaded
          files = pushAllFiles(upload)
        } else {
          if (checkFileInput(upload)) {
            files.push(upload)
          }
        }
      }
      resolve(files)
    })
}

function pushAllFiles (filesUploaded) {
  let filesGathered = []
  filesUploaded.forEach(file => {
    if (checkFileInput(file)) {
      filesGathered.push(file)
    }
  })
  return filesGathered
}

function checkFileInput (file) {
  return (file && fileChecks.checkFileType(file.mimetype) && fileChecks.validateFileSize(Buffer.byteLength(file.data))
  )
}

function postToTeithe (announcement, action) {
  database.AnnouncementsCategories.findOne({_id: announcement._about}).exec(function (err, category) {
    if (category && category.public) {
      generateWordpressContent(announcement.id, announcement.text, announcement.textEn, announcement.attachments, announcement.date, announcement.publisher.name).then(function (wordpressContent) {
        if (action === 'create') {
          clientWordpress.newPost({
            title: '<!--:el-->' + announcement.title + '<!--:--><!--:en-->' + announcement.titleEn + '<!--:-->',
            content: wordpressContent,
            status: 'publish',
            terms: {
              'category': [category.wid]
            }
          }, function (error, id) {
            let update = {wordpressId: id}
            database.Announcements.update({_id: announcement._id},
              update
            ).exec(function (err, announcementUpdated) {
            })
          })
        } else if (action === 'edit') {
          clientWordpress.editPost(announcement.wordpressId, {
            title: '<!--:el-->' + announcement.title + '<!--:--><!--:en-->' + announcement.titleEn + '<!--:-->',
            content: wordpressContent,
            terms: {
              'category': [category.wid]
            }
          }, function (error, data) {

          })
        }
      })
    }
  })
}

function sendEmails (announcementEntry) {
  let sender = announcementEntry.publisher
  let categoryName
  database.AnnouncementsCategories.findOne({_id: announcementEntry._about}).select('name registered -_id').exec(function (err, category) {
    console.log('Reg users from db = ' + category.registered)
    categoryName = category.name
    findEmailsFromUserIds(category.registered).then(function (emails, err) {
      console.log('Mail All = ' + emails)
      console.log('Mail Error finding = ' + err)
      if (emails.length) {
        let bodyText = buildEmailBody(sender.name, announcementEntry.text, announcementEntry.title, categoryName, WEB_BASE_URL.url + '/announcements/' + announcementEntry.id)
        async.forEach(emails, function (to) {
          let mailOptions = {
            from: '"IT-News (' + sender.name + ')" <notify@eng.it.teithe.gr>',
            to: to,
            subject: '[Apps-News] ' + categoryName + ': ' + announcementEntry.title,
            html: bodyText
          }
          MAIL.sendMail(mailOptions, (error, info) => {
            if (error) {
              return error
            }
          })
        }, function (err) {
        })
      }
    })
  })
}

function buildEmailBody (publisher, text, title, categoryName, link) {
  let textToHTML = decodeURIComponent(text).replace(/(?:\r\n|\r|\n)/g, '<br />') // convert to html so it prints line breaks correct
  return 'Μια νεα ανακοίνωση δημιουργήθηκε απο "' + publisher + '" στην κατηγορία " ' + categoryName + '" <br/>' +
    'Ο τίτλος της ανακοίνωσης ειναι: ' + title + '<br/><br/>' +
    'Σύνδεσμος : ' + link + '<br/><br/>' +
    textToHTML + '<br></br>' +
    ''
}

function findEmailsFromUserIds (registeredIds) {
  return new Promise(
    function (resolve, reject) {
      let emails = []
      let searchAttr = []
      registeredIds.forEach(function (id) {
        searchAttr.push(filter.attribute('id').equalTo(id))
      })
      let output = filter.OR(searchAttr)
      let opts = {
        filter: output.toString(),
        scope: 'sub',
        paged: {
          pageSize: 250,
          pagePause: false
        },
        attributes: ['mail', 'id']
      }
      client.search(ldapConfig.LDAP[process.env.NODE_ENV].baseUserDN, opts, function (err, results) {
        if (err) {
          reject(err)
        }
        results.on('searchEntry', function (entry) {
          let tmp = entry.object
          delete tmp.controls
          delete tmp.dn
          if (tmp.status !== 0) {
            emails.push(tmp.mail + '')
          }
        })
        results.on('error', function (err) {
          reject(err)
        })
        results.on('end', function (result) {
          resolve(emails)
        })
      })
    })
}

function sendNotifications (announcementEntry, notificationId, publisherId) {
  return new Promise((resolve, reject) => {
    let calls = []
    database.AnnouncementsCategories.findOne({_id: announcementEntry._about}).exec(function (err, category) {
      category.registered.forEach(function (id) {
        calls.push(function (callback) {
          database.Profile.findOne({
            'ldapId': {$eq: id, $ne: publisherId}
          }).exec(function (err, profile) {
            if (!err && profile) {
              //TODO THIS NEEDS TO BE CHECKED WHEN USER IS IMPLEMENTED
              //sendPush.sendNotification(profile.notySub, announcementEntry, category)
            }
          })

          database.Profile.update({'ldapId': {$eq: id, $ne: publisherId}}, {
            '$addToSet': {
              'notifications': {_notification: notificationId, seen: false}
            }
          }, function (err, updated) {
            if (err) {
              reject(new ApplicationErrorClass('insertNewAnnouncement', null, 109, err, 'Σφάλμα κατα την δημιουργία ανακοίνωσης.', null, 500))
            }
            callback(null)
          })
        })
      })

      async.parallel(calls, function (err) {
        if (err) {
          reject(new ApplicationErrorClass('insertNewAnnouncement', null, 110, err, 'Σφάλμα κατα την δημιουργία ανακοίνωσης.', null, 500))
        }
        resolve()
      })
    })
  })
}

function generateWordpressContent (newAnnouncementId, text, textEn, attachments, date, publisher) {
  return new Promise((resolve, reject) => {
    let buildAttachmentsHtml = new Promise((resolve, reject) => {
      let calls = []
      let attachmentsHtml = ''
      if (attachments) {
        for (let i = 0; i < attachments.length; i++) {
          calls.push(function (callback) {
            database.File.findOne({_id: attachments[i]}).exec(function (err, file) {
              if (file) {
                attachmentsHtml += 'Επισύναψη: <a href="' + WEB_BASE_URL.url + '/files/' + attachments[i] + '">' + file.name + '</a><br/>'
              }
              callback(null)
            })
          })
        }
      }
      async.parallel(calls, function (err) {
        if (err) {
          reject(err)
        }
        resolve(attachmentsHtml)
      })
    })

    buildAttachmentsHtml.then(function (attachmentsHtml) {
      let isoDate = new Date(date)
      let dateModified = formatDate(isoDate, true)

      let htmlContentEl = '<!--:el-->' + text + '<br/>' + attachmentsHtml + dateModified + ' - από ' + publisher + '<!--:-->'
      let htmlContentEn = '<!--:en-->' + textEn + '<br/>' + attachmentsHtml + dateModified + ' - από ' + publisher + '<!--:-->'
      resolve(htmlContentEl + htmlContentEn)
    })
  })
}

function formatDate (date, monthString) {
  let monthNames = [
    'Ιαν', 'Φεβ', 'Μαρτ',
    'Απριλ', 'Μάι', 'Ιούν', 'Ιούλ',
    'Αυγ', 'Σεπτ', 'Οκτώ',
    'Νοέ', 'Δεκ'
  ]

  let day = date.getDate()
  let monthIndex = date.getMonth()
  let year = date.getFullYear()
  let hour = date.getHours()
  let minute = date.getMinutes()

  return monthString ? (day + ' ' + monthNames[monthIndex] + ' ' + year + ' ' + hour + ':' + minute) : (day + '/' + monthIndex + '/' + year + ' ' + hour + ':' + minute)
}

function createNotification (announcementId, publisher) {
  return new Promise((resolve, reject) => {
    let notification = new database.Notification()
    notification.userId = publisher.id
    notification.nameEn = publisher.nameEn
    notification.nameEl = publisher.nameEl
    notification.related.id = announcementId
    notification.save(function (err, newNotification) {
      if (err) {
        reject(new ApplicationErrorClass(null, null, 108, err, null, null, 500))
      } else {
        resolve(newNotification)
      }
    })
  })
}

module.exports = {
  getAnnouncementsRSSPromise,
  validatePublisher,
  createFileEntries,
  checkIfEntryExists,
  gatherFilesInput,
  postToTeithe,
  sendEmails,
  sendNotifications,
  createNotification
}