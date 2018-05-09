#!/bin/bash

clear
stty erase '^?'
echo "Starting Server. Stop the server using Ctrl+c. The server will be running as long as the"
echo "computer is up. Beware of sleep."
node app.js &
export PID=$!

if $pid
then
	echo "Started Server at http://localhost:3000. Point your browser to this address"
else 
	echo "Could not start server"
	exit 2
fi

sigquit()
{
   echo "signal QUIT received"
   kill -9 $pid	   	
}

while [ 1 ]
do
    sleep 2
done
