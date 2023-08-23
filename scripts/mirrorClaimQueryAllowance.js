require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId, TokenId } = require('@hashgraph/sdk');
const { ethers } = require('ethers');
const axios = require('axios');

let abi, iface, baseUrl;

const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const BASEURL_MAIN = 'https://mainnet-public.mirrornode.hedera.com';
const BASEURL_TEST = 'https://testnet.mirrornode.hedera.com';

const env = process.env.ENVIRONMENT ?? null;

const main = async () => {

	if (!getArgFlag('t') || (!getArgFlag('ft') && !getArgFlag('nft')) || getArgFlag('h')) {
		console.log('Usage: mirrorClaimQueryAllowance.js -t <tokenId> -s <spender> -ft|nft  [-serials <serials>] [-o <owner>] [-h]');
		console.log('         spender/owner assumed to be singular');
		console.log('Example: mirrorClaimQueryAllowance.js -t 0.0.111 -s 0.0.222 -ft -o 0.0.333');
		console.log('	check is user 0.0.222 has allowance to spend token 0.0.111 on behalf of user 0.0.333');
		console.log('Example: mirrorClaimQueryAllowance.js -t 0.0.111 -nft -serials 1,2,3');
		console.log('	check who has allowance to spend serial 1,2,3 (assumes single token)');
		console.log('Example: mirrorClaimQueryAllowance.js -t 0.0.111 -s 0.0.222 -nft -o 0.0.333');
		console.log('	check if user 0.0.222 has allowance to spend *ALL* serials of 0.0.111 on behalf of user 0.0.333');
		console.log('	<tokenIds> can be a comma separated list of tokenIds');
		return;
	}

	const serials = getArgFlag('serials') ? getArg('serials').split(',') : [];
	const tokenIdStrList = getArg('t').split(',');
	const tokenIdList = [];
	for (let t = 0; t < tokenIdStrList.length; t++) {
		tokenIdList.push(TokenId.fromString(tokenIdStrList[t]));
	}
	const spender = getArgFlag('s') ? AccountId.fromString(getArg('s')) : null;
	const owner = getArgFlag('o') ? AccountId.fromString(getArg('o')) : null;

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (env.toUpperCase() == 'TEST') {
		baseUrl = BASEURL_TEST;
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		baseUrl = BASEURL_MAIN;
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Contract:', contractId.toString(), 'with name:', contractName, 'and address:', contractId.toSolidityAddress());

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');

	iface = new ethers.Interface(abi);

	console.log('\n -POST to mirror node...\n');
	if (getArgFlag('ft')) {
		if (!owner) {
			console.log('ERROR: Must specify owner with -o -> re-run with -h for help');
			return;
		}
		else if (!spender) {
			console.log('ERROR: Must specify spender with -s -> re-run with -h for help');
			return;
		}
		else if (tokenIdList.length == 0) {
			console.log('ERROR: Must specify tokenId with -t -> re-run with -h for help');
			return;
		}

		const ownerList = [];
		const spenderList = [];
		const tokenSolidityList = [];
		for (let t = 0; t < tokenIdList.length; t++) {
			ownerList.push(owner.toSolidityAddress());
			spenderList.push(spender.toSolidityAddress());
			tokenSolidityList.push(tokenIdList[t].toSolidityAddress());
		}

		const encodedCommand = iface.encodeFunctionData('checkLiveAllowance', [tokenSolidityList[0], ownerList[0], spenderList[0]]);
		console.log('encodedCommand:', encodedCommand);

		console.log(await readOnlyEVMFromMirrorNode(encodedCommand, spender, false));
	}
	else if (getArgFlag('nft')) {
		if (tokenIdList.length == 0) {
			console.log('ERROR: Must specify tokenId with -t -> re-run with -h for help');
			return;
		}

		if (serials.length > 0) {
			if (tokenIdList.length > 1) {
				console.log('ERROR: Must specify only one tokenId with -t when using -serials -> re-run with -h for help');
			}
			// look up if an approved spender per serial
			const tokenIdSolidityList = [];
			for (let s = 0; s < serials.length; s++) {
				tokenIdSolidityList.push(tokenIdList[0].toSolidityAddress());
			}
			const encodedCommand = iface.encodeFunctionData('checkApprovedAddresses', [tokenIdSolidityList, serials]);
			// using a dummy account for the from address
			console.log(await readOnlyEVMFromMirrorNode(encodedCommand, AccountId.fromString('0.0.100'), false));
		}
		else {
			// looking for if all serials approved for a spender from an owner
			if (!owner) {
				console.log('ERROR: Must specify owner with -o -> re-run with -h for help');
				return;
			}
			else if (!spender) {
				console.log('ERROR: Must specify spender with -s -> re-run with -h for help');
				return;
			}
			else if (tokenIdList.length == 0) {
				console.log('ERROR: Must specify tokenId with -t -> re-run with -h for help');
				return;
			}

			const tokenIdSolidityList = [];
			const spenderList = [];
			const ownerList = [];
			for (let s = 0; s < serials.length; s++) {
				tokenIdSolidityList.push(tokenIdList[0].toSolidityAddress());
				spenderList.push(spender.toSolidityAddress());
				ownerList.push(owner.toSolidityAddress());
			}
			const encodedCommand = iface.encodeFunctionData('checkTokensApprovedForAllSerial', [tokenIdSolidityList, ownerList, spenderList], false);
			console.log(await readOnlyEVMFromMirrorNode(encodedCommand, owner, false));
		}
	}
	else {
		console.log('ERROR: Must specify either -ft or -nft -> re-run with -h for help');
		return;
	}
};

async function readOnlyEVMFromMirrorNode(data, from, estimate = true) {
	const body = {
		'block': 'latest',
		'data': data,
		'estimate': estimate,
		'from': from.toSolidityAddress(),
		'gas': 300_000,
		'gasPrice': 100000000,
		'to': contractId.toSolidityAddress(),
		'value': 0,
	};

	const url = `${baseUrl}/api/v1/contracts/call`;

	const response = await axios.post(url, body);
	return response.data;
}

function getArgFlag(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);

	if (customIndex > -1) {
		return true;
	}

	return false;
}

function getArg(arg) {
	const customidx = process.argv.indexOf(`-${arg}`);
	let customValue;

	if (customidx > -1) {
		// Retrieve the value after --custom
		customValue = process.argv[customidx + 1];
	}

	return customValue;
}


main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		// process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});