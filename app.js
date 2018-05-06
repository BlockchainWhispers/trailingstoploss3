var cors = require('cors');
var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server);
var binanceCalls = require('./server/binanceCalls.js');

const options = {
  headers: {
    'Cache-Control': 'no-cache',
  }
};


app.use(cors()); 

server.listen(3000);

//server html, css and js files
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html', options);
});

app.use('/', express.static(__dirname + '/static'));

//routes
app.get('/Balances', function(req, res, next) {
  try{
     binanceCalls.getBalances(res, req.query);
  }
  catch(e){
     var data = { error : e};
     res.end(JSON.stringify({data}));
  }
});

app.get('/trades', function(req, res, next) {
  try{
     binanceCalls.trades(res, req.query);
  }
  catch(e){
     var data = { error : e};
     res.end(JSON.stringify({data}));
  }
});

app.get('/cancel', function(req, res, next) {
  try{
     binanceCalls.stopTrailing(res, req.query);
  }
  catch(e){
     var data = { error : e};
     res.end(JSON.stringify({data}));
  }
});

//websockets
// io.on('connection', function (socket) {
//   socket.on('send:price', function (data) {
//     binanceCalls.getLastPrice(socket, data);
//   });
//   socket.on('trade:status', function (data) {
//     binanceCalls.runTrailingStop(socket, data);
//   });  
// });


io.sockets.on('connect', function(socket) {
    // once a client has connected, we expect to get a ping from them saying what room they want to join
    socket.on('price', function(data) {
        socket.join(data.room);

        io.sockets.in(data.room).emit('send:price', 'what is going on, party people?');

        // this message will NOT go to the client defined above
        //io.sockets.in('foobar').emit('message', 'anyone in this room yet?');

        binanceCalls.getLastPrice(io, data, socket);
    });
    socket.on('trail', function (data) {
        socket.join(data.room);


        var jobHistory = binanceCalls.getHistory();

        io.sockets.in(data.room).emit('trade:status', 'jobHistory');
        if(data.trade){
            binanceCalls.runTrailingStop(io, data, socket);
        }

    }); 
});

