var domain = require('wires-domain');
var client = require('./index');

domain.require(function(WiresClient) {
   WiresClient.send('localhost:3020', {
      command: "test",
      token : "1234",
      message: {
         hello: "world"
      },
      log: function(log) {
         console.log("Some log is here", log)
      }
   }).then(function(msg) {

   }).catch(function(e) {

   })
})
