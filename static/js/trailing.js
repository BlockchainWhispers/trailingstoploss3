'use strict';

var app = angular.module('trailingStop', []);

app.filter('filterAvailableBalance', function () {
	return function (items) {
		var filtered = [];
		for (var coin in items) {
			var item = items[coin];
			if (Number(item.available) > 0 && coin != "USDT") {
				filtered.push(item);
			}
		}
		return filtered;
	};
});

app.controller('trades', function($scope, $http, $filter, socket, $location, $anchorScroll) {
	//properties
	$scope.data = { trade: new Trade()};

	$scope.data.userkeys = {
		apikey: '',
		secretkey: ''
	};
	$scope.dataLoaded = false;
	$scope.data.lastPrice = {
		subscription: ""
	};

	socket.on('connect', function(){
	});


	//get Latest Price
	socket.on('send:price', function(data){
		$scope.data.lastPrice = data;
		checkTradeState($scope.data.trade.stop);
		checkTradeState($scope.data.trade.limit);

		if($scope.data.trade.amount.set){
			$scope.data.trade.amount.price = ($scope.data.trade.amount.coinAmount * $scope.data.trade.limit.price).toFixed($scope.data.decimals);
			$scope.data.trade.amount.price = Number($scope.data.trade.amount.price);
		}
		if($scope.data.trade.lazy.set){
			$scope.calculateSellPrice();
		}
	});

	socket.on('trade:status', function(data){
		if(data != "jobHistory")
			$scope.data.tradeHistory = data;
	});

	function checkTradeState(tradeType){
		if(tradeType.set == false){
			tradeType.price = $scope.data.lastPrice.last;
		}
		else{
			tradeType.price = Number($scope.data.lastPrice.last) * ((100 - tradeType.percentage) / 100);
			tradeType.price = parseFloat(tradeType.price).toFixed($scope.data.decimals);
			if(isNaN(tradeType.price)){
				tradeType.price = "";
			}			
		}		
	}

	function Trade(){
		this.stop = {
			set: false,
			price: 0,
			type: "stop"
		};
		this.limit = {
			set: false,
			price: 0,
			type: "limit"
		};
		this.amount = {
			set: false,
			amountPercentage: 0,
			type: "amount"			
		};
		this.lazy = {
			set: false,
			type: "lazy"
		};
	}	

	//data loading
	$scope.loadData = function(){
		$http({
			method: 'GET',
			url: 'http://127.0.0.1:3000/balances/?apiKey=' + $scope.data.userkeys.apikey + "&secretKey=" + $scope.data.userkeys.secretkey
		}).then(function successCallback(response) {
	    // this callback will be called asynchronously
	    // when the response is available
	  	if(response.data.balances != undefined && response.data.error == undefined){
	  		$scope.data.coins = response.data.balances;
	    	$scope.dataLoaded = true;
	    	$scope.danger = false;
	    	$scope.warning = false;
	    	$scope.getTrade();
	  	}
	  	else{
	  		$scope.warning = true;
	  		$scope.danger = false;
	  		$scope.data.error = response.data.error;
	  		if(Object.keys($scope.data.error).length === 0 && $scope.data.error.constructor === Object){
	  			$scope.data.error = "Something went wrong while logging in please try again."
	  		}
	  	}
		}, function errorCallback(response) {
	    // called asynchronously if an error occurs
	    // or server returns response with an error status.
	    	$scope.danger = true;
	  		$scope.warning = false;
		});
	}

	$scope.getTrade = function(){
		$http({
			method: 'GET',
			url: 'http://127.0.0.1:3000/trades/'
		}).then(function successCallback(response) {
	    // this callback will be called asynchronously
	    // when the response is available
	  	if(response.data.data.tradeHistory != undefined && response.data.error == undefined){
	  		$scope.data.tradeHistory = response.data.data.tradeHistory;
	  		if($scope.data.tradeHistory.length > 0){
	  			socket.emit('trail', {room: 'trail'});
	  		}
	  	}
	  	else{
	  		
	  	}
		}, function errorCallback(response) {
	    // called asynchronously if an error occurs
		});
	}

	$scope.cancelOrder = function(trade){
		$http({
			method: 'GET',
			url: 'http://127.0.0.1:3000/cancel/?pair=' + trade.pair + "&orderId=" + trade.orderId + "&subscription=" + trade.subscription 
		}).then(function successCallback(response) {
	    // this callback will be called asynchronously
	    // when the response is available
	  	if(response.data.tradeHistory != undefined && response.data.error == undefined){
	  		$scope.data.tradeHistory = response.data.tradeHistory;
	  	}
	  	else{
	  		
	  	}
		}, function errorCallback(response) {
	    // called asynchronously if an error occurs
		});
	}		

	$scope.submit = function() {
		if($scope.data.userkeys.apikey != null && $scope.data.userkeys.secretkey != null){
			$scope.loadData();
		}
	};

	$scope.removeExtraChars = function(value, length){
		  var fieldLength = value.toString().length;
		  if(fieldLength <= length){
		    return value;
		  }
		  else
		  {
		    var str = value.toString();
		    str = str.substring(0, str.length - 1);
		    return Number(str);
		  }		
	}

	$scope.addTradingPair = function(){
		$scope.data.trade = new Trade();
		$scope.data.tradingPairs = $scope.data.coins[$scope.data.selectedCoin].tradingPairs;
	}

	$scope.getLatestPrice = function(){
		//$scope.data.trade = new Trade();
		if ($scope.data.selectedCoinPair != null){
			document.getElementById('content').src = "/html/chart.html?value="+ $scope.data.selectedCoinPair.replace('/', '') + "&width=" + Math.round(screen.width * 0.58).toString();
	        document.getElementById('content').style.display = "block";

			$scope.data.decimals = 0;
			var tradePair = $scope.data.tradingPairs.find( pair => pair.pair === $scope.data.selectedCoinPair);
			if(tradePair){
				var filter = tradePair.filters.find( filt => filt.filterType == "PRICE_FILTER");

				var minValue = tradePair.filters.find( x => x.filterType == "MIN_NOTIONAL");

				if (minValue){
					$scope.data.minValue = minValue.minNotional;
				}

				var lotSize = tradePair.filters.find( x => x.filterType == "LOT_SIZE");

				if(lotSize){
					$scope.data.lotSize = (Number(lotSize.minQty) + 1);
					$scope.data.lotSize = Number($scope.data.lotSize).countDecimals();
					$scope.data.lotStepSize = lotSize.minQty;
				}

				$scope.data.trade.filter = tradePair.filters;
				if (filter){
					var minPrice = (Number(filter.minPrice) + 1).toFixed(8);
					$scope.data.decimals = Number(minPrice).countDecimals();
				}
			}

			socket.emit('price', { 
				pair: $scope.data.selectedCoinPair.replace('/', ''),
				subscription: $scope.data.lastPrice.subscription,
				room: 'price'
			});			
		}
	}

	$scope.calculatePrice = function(tradeType){
		if(tradeType.percentage != null){
			if(tradeType.type == "stop" && tradeType.percentage > 99){
				tradeType.percentage = $scope.removeExtraChars(tradeType.percentage, 2);
			}

			if(tradeType.type == "limit" && tradeType.percentage > 99){
				tradeType.percentage = $scope.removeExtraChars(tradeType.percentage, 2);
			}

			tradeType.set = true;
			tradeType.price = Number($scope.data.lastPrice.last) * ((100 - tradeType.percentage) / 100);
			tradeType.price = parseFloat(tradeType.price).toFixed($scope.data.decimals);

			if(isNaN(tradeType.price)){
				tradeType.price = "";
			}

			if(tradeType.type == "limit"){
				if($scope.data.trade.amount.set){
					$scope.calculateCoinsValue();
				}
			}					
		}

	}

	$scope.removeNegatives = function(){
		var keys = [8, 9, 13, 16, 17, 18, 19, 20, 27, 46, 48, 49, 50,
		    51, 52, 53, 54, 55, 56, 57, 91, 92, 93
		  ];
		  if (event.keyCode && keys.indexOf(event.keyCode) === -1)
		    return event.preventDefault();
	}		

	$scope.calculateCoinsValue = function(){
		var power = Math.pow(10, $scope.data.lotSize);

		$scope.data.trade.amount.coinAmount = Math.floor(($scope.data.trade.amount.coinAmount) * power) / power;

		$scope.data.trade.amount.set = true;
		$scope.data.trade.amount.price = ($scope.data.trade.amount.coinAmount * $scope.data.trade.limit.price).toFixed($scope.data.decimals);
		$scope.data.trade.amount.price = Number($scope.data.trade.amount.price);
	}

	$scope.calculateAmount = function(){
		$scope.data.trade.amount.coinAmount = Number(($scope.data.coins[$scope.data.selectedCoin].available * ($scope.data.trade.amount.amountPercentage / 100)).toFixed($scope.data.lotSize));

		var power = Math.pow(10, $scope.data.lotSize);

		//$scope.data.trade.amount.coinAmount = Math.floor($scope.data.trade.amount.coinAmount) / 100;

		if($scope.data.trade.amount.coinAmount > $scope.data.coins[$scope.data.selectedCoin].available){
			$scope.data.trade.amount.coinAmount = Math.floor(($scope.data.trade.amount.coinAmount - Number($scope.data.lotStepSize)) * power) / power;
		}		

		$scope.calculateCoinsValue();
	}

	$scope.calculateSellPrice = function(){
		if ($scope.data.trade.lazy.percentage != null){
			if ($scope.data.trade.lazy.percentage > 99){
				$scope.data.trade.lazy.percentage = $scope.removeExtraChars($scope.data.trade.lazy.percentage, 2);
			}
			if($scope.data.trade.lazy.percentage.countDecimals() > 3 ){
				var power = Math.pow(10, 3);
				$scope.data.trade.lazy.percentage = Math.floor(($scope.data.trade.lazy.percentage) * power) / power;
			}

			$scope.data.trade.lazy.set = true;
			$scope.data.trade.lazy.price = Number(($scope.data.lastPrice.last * ((100 + $scope.data.trade.lazy.percentage) / 100)).toFixed($scope.data.decimals));					
		}
	}

	$scope.runTrailStop = function(){
		$scope.data.trade.pair = $scope.data.selectedCoinPair.replace('/', '');
		socket.emit('trail', { trade: $scope.data.trade, room: 'trail'});
	}

	function fieldValidate(element, condition){
		if(condition){
			element.classList.add("is-invalid");
			element.classList.remove("is-valid");
			return false;
		}
		else{
			element.classList.remove("is-invalid");
			element.classList.add("is-valid");
			return true;
		}		
	}

	$scope.stopLimit_sell_submit = function(){
		//form validation
		var stopPercentage = document.getElementById('stopPercentage');
		var limitPercentage = document.getElementById('limitPercentage');
		var coinAmount = document.getElementById('coinAmount');
		var lazinessPercentage = document.getElementById('lazinessPercentage');

		var tradePair = $scope.data.tradingPairs.find( pair => pair.pair === $scope.data.selectedCoinPair);
		var minValue = tradePair.filters.find( x => x.filterType == "MIN_NOTIONAL");

		$scope.data.minError = false;
		$scope.data.maxError = false;

		var stop = fieldValidate(stopPercentage, ($scope.data.trade.stop.percentage <= 0 
									|| $scope.data.trade.stop.percentage > 99 
									|| isNaN($scope.data.trade.stop.percentage)));

		var limit = fieldValidate(limitPercentage, ($scope.data.trade.limit.percentage <= 0 
									|| $scope.data.trade.limit.percentage > 99 
									|| isNaN($scope.data.trade.limit.percentage)));

		var amount = fieldValidate(coinAmount, (/*$scope.data.trade.amount.coinAmount > $scope.data.coins[$scope.data.selectedCoin].available
								|| */$scope.data.trade.amount.coinAmount <= 0 
								|| $scope.data.trade.amount.coinAmount == null) 
								|| $scope.data.trade.amount.price <= Number(minValue.minNotional * 1.1).toFixed($scope.data.decimals));
		if (!amount){
			$scope.data.minError = true;
		}else{
			amount = fieldValidate(coinAmount, ($scope.data.trade.amount.coinAmount > Number($scope.data.coins[$scope.data.selectedCoin].available)));

			if(!amount){
				$scope.data.maxError = true;
			}
		}

		var lazinesss = fieldValidate(lazinessPercentage, ($scope.data.trade.lazy.percentage <= 0) 
									|| $scope.data.trade.lazy.percentage == null);

		if (stop && limit && amount && lazinesss){
			$scope.runTrailStop();
		}else{
			$location.hash('trail');
       		$anchorScroll();
		}


	}
});

