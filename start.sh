#!/bin/bash

clear
stty erase '^?'
echo "Starting Server. Stop the server using Ctrl+c. The server will be running as long as the"
echo "computer is up. Beware of sleep."
echo "Server can be found at http://localhost:3000"
if node app.js
then
	echo "Started Server"
else 
	echo "Could not start server"
fi
