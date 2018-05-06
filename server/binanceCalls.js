//binanceCalls.js
'use strict'

var coins = require('./cryptoCompareCoins.js');
var request = require('request');
var socket = require('socket.io')();
var fs = require('fs');

const binance = require('node-binance-api');

//properties
var jobHistory = [];
var activeJob = "";

var logger = fs.createWriteStream('log.txt', {
  flags: 'a' // 'a' means appending (old data will be preserved)
})

//functions
function ApiException(message) {
	this.message = message;
	this.name = 'UserException';
}

Number.prototype.countDecimals = function () {
  if(Math.floor(this.valueOf()) === this.valueOf()) return 0;
  return this.toString().split(".")[1].length || 0; 
}	

function binanceOptions(res, query){
	try{
		binance.options({
			APIKEY: query.apiKey,
			APISECRET: query.secretKey,
		  	useServerTime: true, // If you get timestamp errors, synchronize to server time at startup
		  	//test: true,// If you want to use sandbox mode where orders are simulated,
		  	reconnect: false
		});
		getBalances(res);
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
		res.end(JSON.stringify({error: e}));
	}
};

function getBalances(res){
	try{
		binance.balance((error, balances) => {
			var data  = {
				balances: balances,
				ticker: null
			}
			if (error){
				res.statusCode = 200;
	        	res.end(JSON.stringify({error: JSON.parse(error.body).msg}));
			}
			else{	
				binance.prices((error, ticker) => {
	  				data.ticker = ticker;
					coins.getCoins(res, data);
				});
			}
		});	
	}
	catch(e){
		res.end(JSON.stringify({error: e}));
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}
};

function getLastPrice(io, tradingPair, interval){
	try{
		binance.websockets.chart(tradingPair.pair, interval, (symbol, interval, chart) => {
			let tick = binance.last(chart);
			const last = chart[tick].close;
			//console.log(chart);
			// Optionally convert 'chart' object to array:
			// let ohlc = binance.ohlc(chart);
			// console.log(symbol, ohlc);
			console.log(symbol+" last price: "+last);
			// socket.emit('send:price', {
			// 	last: last,
			// 	subscription: tradingPair.pair.toLowerCase() + "@kline_1m"
			// });
			//socket.join('price');
			io.sockets.in('price').emit('send:price', {
				last: last,
				subscription: tradingPair.pair.toLowerCase() + "@kline_1m"
			});
		});	
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}

};


function tradeEmitter(trade, io, socket){
	io.sockets.in('trail').emit('trade:status', jobHistory);	
}

function removeJobFromList(pair){
	for(var i = 0; i < jobHistory.length; i++){
		if (jobHistory[i].pair == pair){
			jobHistory.splice(i, 1);
			//jobExists = true;
		}
	}	
}

function calculateStopLimit(trade, last, decimals){
	trade.price = Number(last) * ((100 - trade.percentage) / 100);
	trade.price = parseFloat(trade.price).toFixed(decimals);	
}

function terminateWebsocketsBinance(endpointName){
    let endpoints = binance.websockets.subscriptions();

    for ( let endpoint in endpoints ) {
        if(endpoint == endpointName){
        	binance.websockets.terminate(endpoint);
        }
    }	
}

function updateTrade(trade, last, io, socket){

	var priceFilter = trade.filter.find( x => x.filterType == "PRICE_FILTER");

	if(priceFilter){
		var minPrice = (Number(priceFilter.minPrice) + 1).toFixed(8);
		var decimals = Number(minPrice).countDecimals();	

		calculateStopLimit(trade.stop, last, decimals);
		calculateStopLimit(trade.limit, last, decimals);

		//estimated amount price
		trade.amount.price = (trade.amount.coinAmount * trade.limit.price).toFixed(decimals);
		trade.amount.price = Number(trade.amount.price);

	
		trade.lazy.price = Number(last * ((100 + trade.lazy.percentage) / 100)).toFixed(decimals);

		console.log("Lazy price has changed to: " + trade.lazy.price);
		trade.status = "UPDATED";

		terminateWebsocketsBinance(trade.subscription);

		cancelOrderAndTrailAgain(trade, io, socket);
	}
}

function runTrailingStop(io, trade, socket){

	try{
		binance.websockets.chart(trade.pair, '5m', (symbol, interval, chart) => {
			let tick = binance.last(chart);
			const last = chart[tick].close;

			trade.subscription = trade.pair.toLowerCase() + "@kline_5m";

			if(trade.subscription){

				var job = jobHistory.find(job => (job.subscription === trade.subscription));
				
				if(!job){
					jobHistory.push(trade);
				}
			}
			for(var i = 0; i < jobHistory.length; i++){
				console.log("Job pair: " + jobHistory[i].pair); 
				console.log("Job status: " + jobHistory[i].status);
			}

			trade.last = last;

			try{
				binance.orderStatus(trade.pair, trade.orderId, (error, orderStatus, symbol) => {
					console.log(symbol+" order status:", orderStatus);

					trade.status = orderStatus.status;
					if(trade.status == "CANCELED" || trade.status == "FILLED"){
			  			removeJobFromList(trade.pair);
			  			if(trade.pair == activeJob){
			  				activeJob = "";
			  			}
			  			terminateWebsocketsBinance(trade.subscription);
					}
					else{
						if(Number(last) >= Number(trade.lazy.price)){

							updateTrade(trade, Number(last), io, socket);
						}
					}
					if(trade.pair == activeJob || activeJob == ""){
					    tradeEmitter(trade, io);
					}
				});		
			}
			catch(e){
				logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
			}

			
		});	
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}
}


function stopLoss(trade, trailing, io, socket){
	try{
		let type = "STOP_LOSS_LIMIT";
		binance.sell(trade.pair, trade.amount.coinAmount, trade.limit.price, {stopPrice: trade.stop.price, type: type}, (error, response) => {
	  		if(!error){
				console.log("Market Sell response", response);
	  			console.log("order id: " + response.orderId);
	  			trade.orderId = response.orderId;
	  			if(trailing){
					runTrailingStop(io, trade, socket);			
	  			}
	  		}
	  		else{
	  			trade.error = JSON.parse(error.body).msg;
	  			trade.status = "ERROR";
				tradeEmitter(trade, io);
	  		}

		});		
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}	
}

function cancelOrderAndTrailAgain(trade, io, socket){
	try{
		binance.cancel(trade.pair, trade.orderId, (error, response, symbol) => {
		  console.log(symbol+" cancel response:", response);
		  if (error){
		  	trade.status = "ERROR";
			tradeEmitter(trade, io);			
		  }
		  else{
			trade.status = "UPDATED";
			stopLoss(trade, true, io, socket);
		  }
		});		
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}

}


function cancelOrder(trade){
	try{
		binance.cancel(trade.pair, trade.orderId, (error, response, symbol) => {
		  console.log(symbol+" cancel response:", response);
		  if (error){
		  	trade.status = "ERROR";
		  }
		});		
	}
	catch(e){
		logger.write("Error: " + e +"\r\n" + "Stack: " + e.stack + "\r\n");
	}

}

module.exports = {
	getBalances: function(res, query){
		binanceOptions(res, query);	
	},
	trades: function(res, query){
		var data = {tradeHistory: jobHistory};

		res.end(JSON.stringify({data}));
	},	
	getLastPrice: function(io, tradingPair, socket){
		//console.log(tradingPair);
	    let endpoints = binance.websockets.subscriptions();

	    for ( let endpoint in endpoints ) {
	        if(endpoint.includes('@kline_1m')){
	        	binance.websockets.terminate(endpoint);
	        }
	    }

		getLastPrice(io, tradingPair, '1m');	
	},
	runTrailingStop: function(io, trade){

		var jobExists = false;

		for(var i = 0; i < jobHistory.length; i++){
			if (jobHistory[i].pair == trade.trade.pair){
				//jobHistory.splice(i, 1);
				jobExists = true;
			}
		}

		//terminateWebsocketsBinance(trade.trade.pair.toLowerCase() + "@kline_1m")

		if(jobExists){
			// io.emit('trade:status', {
			// 	error: 'There is already a job running on this coin, cancel or wait for it to finish before setting a new one!'
			// });				
		}
		else{
			console.log(trade);
			activeJob = trade.trade.pair;
			stopLoss(trade.trade, true, io, socket);
		}		
	},
	stopTrailing: function(res, trade){
		terminateWebsocketsBinance(trade.subscription);
		removeJobFromList(trade.pair);
		cancelOrder(trade);


		res.end(JSON.stringify({tradeHistory: jobHistory}));
	},
	getHistory(){
		return jobHistory;
	}
}