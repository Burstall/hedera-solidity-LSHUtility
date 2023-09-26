const { AccountId } = require('@hashgraph/sdk');
const { default: axios } = require('axios');

function getBaseURL(env) {
	if (env.toLowerCase() == 'test') {
		return 'https://testnet.mirrornode.hedera.com';
	}
	else if (env.toLowerCase() == 'main') {
		return 'https://mainnet-public.mirrornode.hedera.com';
	}
	else if (env.toLowerCase() == 'preview') {
		return 'https://previewnet.mirrornode.hedera.com';
	}
	else if (env.toLowerCase() == 'local') {
		return 'http://localhost:8000';
	}
	else {
		throw new Error('ERROR: Must specify either MAIN, TEST, LOCAL or PREVIEW as environment');
	}
}

/**
 * Chyeck mirror for the allowance
 * @param {AccountId} _userId
 * @param {TokenId} _tokenId
 * @param {AccountId} _spenderId
 */
async function checkMirrorAllowance(env, _userId, _tokenId, _spenderId) {
	const baseUrl = getBaseURL(env);
	const url = `${baseUrl}/api/v1/accounts/${_userId.toString()}/allowances/tokens`;

	let rtnVal = 0;
	await axios.get(url)
		.then((response) => {
			const jsonResponse = response.data;

			jsonResponse.allowances.forEach(allowance => {
				if (allowance.spender == _spenderId.toString()) {
					// console.log(' -Mirror Node: Found allowance for', allowance.owner, 'with allowance', allowance.amount, 'of token', allowance.token_id);
					rtnVal = Number(allowance.amount);
				}
			});
		})
		.catch(function(err) {
			console.error(err);
			return 0;
		});

	return rtnVal;
}

async function checkMirrorNFTAllowance(env, _userId, _tokenId, _serial) {
	const baseUrl = getBaseURL(env);
	const url = `${baseUrl}/api/v1/tokens/${_tokenId}/nfts?account.id=${_userId.toString()}`;

	let rtnVal;
	await axios.get(url)
		.then((response) => {
			const jsonResponse = response.data;

			jsonResponse.nfts.forEach(nft => {
				if (nft.serial_number == _serial && nft.token_id == _tokenId.toString()) {
					// console.log(' -Mirror Node: Found NFT allowance for', nft.account_id, 'serial', nft.serial_number, 'to be spent by', nft.spender, '(delegating spender =', nft.delegating_spender, ')');
					rtnVal = nft.spender;
				}
			});
		})
		.catch(function(err) {
			console.error(err);
			return 0;
		});

	return rtnVal;
}

/**
 * Helper function to check the last event on the mirror node
 * @param {string} env
 * @param {ContractId} contractId
 * @param {ethers.Interface} iface
 * @returns {BigInt} the value of the event
 * @throws {Error} if the event is not found
 */
async function checkLastMirrorEvent(env, contractId, iface) {
	const baseUrl = getBaseURL(env);
	const url = `${baseUrl}/api/v1/contracts/${contractId.toString()}/results/logs?order=desc&limit=1`;

	let rtnVal;
	await axios.get(url)
		.then(function(response) {
			const jsonResponse = response.data;

			jsonResponse.logs.forEach(log => {
				// decode the event data
				if (log.data == '0x') return;
				const event = iface.parseLog({ topics: log.topics, data: log.data });

				let outputStr = 'Block: ' + log.block_number
						+ ' : Tx Hash: ' + log.transaction_hash
						+ ' : Event: ' + event.name + ' : ';

				for (let f = 0; f < event.args.length; f++) {
					const field = event.args[f];
					// console.log('Field:', f, field, typeof field);

					let output;
					if (typeof field === 'string') {
						output = field.startsWith('0x') ? AccountId.fromEvmAddress(0, 0, field).toString() : field;
					}
					else {
						output = field.toString();
					}
					output = f == 0 ? output : ' : ' + output;
					outputStr += output;
				}
				console.log(outputStr);
				rtnVal = Number(event.args[1]);
			});
		})
		.catch(function(err) {
			console.error(err);
			return null;
		});
	return rtnVal;
}

/**
 * Basic query of mirror node for token balance
 * @param {string} env
 * @param {AccountId} _userId
 * @param {TokenId} _tokenId
 * @returns {Number} balance of the token
 */
async function checkMirrorBalance(env, _userId, _tokenId) {
	const baseUrl = getBaseURL(env);
	const url = `${baseUrl}/api/v1/accounts/${_userId.toString()}/tokens?token.id=${_tokenId.toString()}`;

	let rtnVal = 0;
	await axios.get(url)
		.then((response) => {
			const jsonResponse = response.data;

			jsonResponse.tokens.forEach(token => {
				if (token.token_id == _tokenId.toString()) {
					// console.log(' -Mirror Node: Found balance for', _userId.toString(), 'of', token.balance, 'of token', token.token_id);
					rtnVal = Number(token.balance);
				}
			});
		})
		.catch(function(err) {
			console.error(err);
			return 0;
		});

	return rtnVal;
}


module.exports = {
	checkMirrorAllowance,
	checkMirrorNFTAllowance,
	getBaseURL,
	checkLastMirrorEvent,
	checkMirrorBalance,
};