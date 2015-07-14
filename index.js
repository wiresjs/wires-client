var _ = require('lodash');
var domain = require('wires-domain');
var Promise = require('promise')
var socket = require('socket.io-client')
var shortid = require('shortid');
var logger = require("log4js").getLogger("WiresClient");

var connections = {};
var jobs = {};
domain.service("WiresClient", function() {
   return {
      // Sending a build command
      send: function(server, options) {
         var self = this;
         var options = options || {};

         return new Promise(function(resolve, reject) {
            self._send(server, {
               command: options.command,
               token: options.token || "123",
               message: options.message,
               log: function(msg) {
                  if (_.isFunction(options.log)) {
                     options.log(msg);
                  }
               },
               finished: function(msg) {
                  return resolve(msg);
               },
               failed: function(msg) {
                  return reject(msg);
               }
            }).catch(reject)
         });
      },
      _send: function(server, options) {
         return this.getConnection(server, options.token).then(function(socket) {
            // taskid

            var jobId = shortid.generate()

            if (!options.command) {
               throw {
                  status: 400,
                  message: "Command is not defined"
               }
            }
            if (!options.message) {
               throw {
                  status: 400,
                  message: "message is not defined"
               }
            }
            if (!options.log) {
               throw {
                  status: 400,
                  message: "Log callback should be defined"
               }
            }
            if (!options.finished) {
               throw {
                  status: 400,
                  message: "finished callback should be defined"
               }
            }
            if (!options.failed) {
               throw {
                  status: 400,
                  message: "failed callback should be defined"
               }
            }
            // register job
            jobs[jobId] = {
               log: options.log,
               finished: options.finished,
               failed: options.failed
            }
            socket.emit("event", {
               jobId: jobId,
               command: options.command,
               message: options.message
            });
         });
      },
      getConnection: function(address, token) {
         var self = this;
         address = address || 'localhost:3020'
         return new Promise(function(resolve, reject) {

            logger.info("Creating a connection to " + address)
            var client = {
               resolved: false,
               error: false,
               connecting: true,
               socket: undefined
            }

            client.socket = socket('http://' + address, {
               query: {
                  token: token || "pukka"
               }
            });
            client.socket.on('disconnect', function() {
               logger.info("Disconnected from  " + address)
               if (client.socket) {
                  try {
                     client.socket.disconnect()
                  } catch (e) {}
               }
            });
            client.socket.on('connect', function() {
               client.connecting = false;
               logger.info("Connected  " + address)
               if (client.resolved === false) {
                  client.resolved = true;
                  return resolve(client.socket)
               }
            });

            client.socket.on('error', function(data) {

               var data;
               try {
                  if (_.isString(data)) {
                     data = JSON.parse(data)
                  }
               } catch (e) {}
               logger.info("Socket error " + address)
               if (data.message) {
                  logger.fatal(data.message)
               }
               client.socket.disconnect();
               return reject(data)
            });

            // User events
            // Listening for logs
            // Expects { jobId : '123123', message : {} }
            client.socket.on("log", function(data) {
               if (data.jobId && jobs[data.jobId]) {
                  var cbs = jobs[data.jobId];
                  if (cbs.log) {
                     //logger.info("Logging for  " + data.jobId + " @" + address + " -> " + data.message)
                     cbs.log(data.message || {})
                  }
               }
            });
            // Triggered when the job is finished
            // Listening for logs
            // Expects { jobId : '123123', message : {} }
            client.socket.on("finished", function(data) {
               if (data.jobId && jobs[data.jobId]) {
                  var cbs = jobs[data.jobId];
                  if (cbs.finished) {
                     logger.info("Job finished for  " + data.jobId + " @" + address + " -> " +
                        JSON.stringify(data.message))
                     cbs.finished(data.message || {})
                  }
                  delete jobs[data.jobId];
                  client.socket.disconnect()

               }
            });
            // Expects { jobId : '123123', message : {} }
            client.socket.on("failed", function(data) {
               if (data.jobId && jobs[data.jobId]) {
                  var cbs = jobs[data.jobId];
                  if (cbs.failed) {
                     logger.fatal("Job failed for  " + data.jobId + " @" + address + " -> " +
                        JSON.stringify(data.message))
                     cbs.failed(data.message || {})
                  }
                  if (socket.connected) {
                     socket.disconnect()
                  }
                  delete jobs[data.jobId];
               }
            });
         })

      }
   }
})
