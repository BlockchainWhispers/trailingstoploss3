//cryptoCompareCoins.js
var request = require('request');

function ApiException(message) {
  this.message = message;
  this.name = 'UserException';
}

function TradingPair(coinName){
  this.pair = coinName;
  this.filters = [];
}
//functions
function addLogo(coins, balances){
  for(var coinName in balances){
    for(var coin in coins){
        if(coinName == coin){
            balances[coinName].logoUrl = "https://www.cryptocompare.com" + coins[coin].ImageUrl;
            balances[coinName].coinName = coins[coin].CoinName;
            balances[coinName].symbol = coins[coin].Symbol;
            balances[coinName].tradingPairs = [];
            //console.log(balances[coinName]);
        }
    }
  }
};

function getTradingPairs(balances, ticker){
  for(var coinName in balances){
    balances[coinName].tradingPairs = [];
    for(var tick in ticker){
        if(tick.startsWith(coinName)){
            //console.log(tick + coinName);
            balances[coinName].tradingPairs.push(new TradingPair(tick.replace(coinName, coinName + "/")));
          }
    }
  }
}

function addSymbolData(balances, symbols){
  for(var coinName in balances){
    if(balances[coinName].tradingPairs.length > 0){
      for( var i = 0; i < balances[coinName].tradingPairs.length; i++){
        if(balances[coinName].tradingPairs[i].pair){
          var tradingPair = balances[coinName].tradingPairs[i].pair.replace('/', '');
          if(tradingPair){
            var symbol = symbols.find( sym => sym.symbol === tradingPair);
            if (symbol){
              balances[coinName].tradingPairs[i].filters = symbol.filters;
            }
          }           
        }
      }
    }
  }
}

function getCoinFilters(mainCall, data){
  var options = {
    url: 'https://api.binance.com/api/v1/exchangeInfo',
    method: 'GET'
  };

  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      try{
        var mainData = JSON.parse(body);

        var symbols = mainData.symbols;

        if(symbols.length > 0){
          addSymbolData(data.balances, symbols)
        }
        else{
          data.error = "Binance API down";
          mainCall.end(JSON.stringify({data}));                  
        }                             
      }
      catch(e){
        data.error = e;
      }
    }
    mainCall.statusCode = 200;
    mainCall.setHeader('Content-Type', 'application/json');
    mainCall.end(JSON.stringify(data));                    
  });
}

//methods
module.exports = {
  getCoins: function (mainCall, data) {
            // Configure the request
            var options = {
              url: 'https://min-api.cryptocompare.com/data/all/coinlist',
              method: 'GET'
            };
            // Start the request
            request(options, function (error, response, body) {
              if (!error && response.statusCode == 200) {
                coins = JSON.parse(body);

                addLogo(coins.Data, data.balances);
                getTradingPairs(data.balances, data.ticker);

                if(Object.keys(data.balances).length === 0 && data.balances.constructor === Object){
                  data.error = "Binance API down";
                  mainCall.end(JSON.stringify({data}));
                }
                else{
                  getCoinFilters(mainCall, data);
                }
              }
              else{
                 data.error = "Binance API down";
                 mainCall.end(JSON.stringify({data}));
              }
            });
          }
}