//This file implements functions to check which continents are open, update base ownership, and send unlock notifications

const {territoryInfo} = require('./territory.js');
const {serverIDs, serverNames, servers, continents} = require('./utils.js');
const {send} = require('./messageHandler.js');
const {unsubscribeAll} = require('./subscriptions.js');
const {Permissions} = require('discord.js');
const trackers = require('./trackers.js');

const contIDs = {
	"Indar": "2",
	"Hossin": "4",
	"Amerish": "6",
	"Esamir": "8",
	"Koltyr": "14"
}

const notifyUnlock = async function(cont, server, channelID, pgClient, discordClient){
	try{
		const channel = await discordClient.channels.fetch(channelID);
		if(typeof(channel.guild) !== 'undefined'){
			if(channel.permissionsFor(channel.guild.me).has([Permissions.FLAGS.SEND_MESSAGES, Permissions.FLAGS.VIEW_CHANNEL, Permissions.FLAGS.EMBED_LINKS])){
				await send(channel, `${cont} on ${server} is now open!`, "Continent unlock");
			}
			else{
				unsubscribeAll(pgClient, channelID);
				console.log(`Unsubscribed from ${channelID}`);
			}
		}
		else{
			const res = await send(channel, `${cont} on ${server} is now open!`, "Continent unlock");
			if(res == -1){
				unsubscribeAll(pgClient, channelID);
				console.log(`Unsubscribed from ${channelID}`);
			}
		}
	}
	catch(err){
		if(err.code == 10003){ //Unknown channel error, thrown when the channel is deleted
			unsubscribeAll(pgClient, channelID);
			console.log(`Unsubscribed from ${channelID}`);
		}
		else{
			console.log("Continent unlock notify error");
			console.log(err);
		}
	}
}

module.exports = {
	check: async function(pgClient, discordClient){
		for(const server of servers){
			try{
				const territory = await territoryInfo(serverIDs[server]);
				const currentStatus = await pgClient.query("SELECT * FROM openContinents WHERE world = $1;", [server]);
				for(const cont of continents){
					if(territory[cont].locked != -1){
						await pgClient.query("DELETE FROM bases WHERE continent = $1 AND world = $2;",
						[contIDs[cont], serverIDs[server]]);
					}
					else if(!currentStatus.rows[0][cont.toLowerCase()]){
						// If continent is open but recorded as closed
						try{
							const result = await pgClient.query("SELECT u.channel, c.Indar, c.Hossin, c.Amerish, c.Esamir, c.Koltyr, c.autoDelete\
							FROM unlocks u LEFT JOIN subscriptionConfig c on u.channel = c.channel\
							WHERE u.world = $1;", [server]);
							for (const row of result.rows){
								if(row[cont.toLowerCase()]){
									await notifyUnlock(cont, serverNames[serverIDs[server]], row.channel, pgClient, discordClient);
								}
							}
						}
						catch(err){
							console.log("Unlock error")
							console.log(err);
						}
						trackers.update(pgClient, discordClient, true); //Update trackers with new continent
					}
				}
				await pgClient.query("UPDATE openContinents SET indar = $1, hossin = $2, amerish = $3, esamir = $4, koltyr = $5 WHERE world = $6;",
				[territory["Indar"].locked == -1, territory["Hossin"].locked == -1, territory["Amerish"].locked == -1, territory["Esamir"].locked == -1, territory["Koltyr"].locked == -1, server]);
			}
			catch(err){
				continue;  //Will retry in a minute, don't need to fill log
			}
		}
	}
}