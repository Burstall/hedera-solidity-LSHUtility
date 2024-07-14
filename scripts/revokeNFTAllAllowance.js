require('dotenv').config();
const fs = require('fs');
const { ContractId, AccountId, TokenId, Client, AccountAllowanceDeleteTransaction, PrivateKey } = require('@hashgraph/sdk');
const { ethers } = require('ethers');
const { getArgFlag, sleep } = require('../utils/nodeHelpers');
const readlineSync = require('readline-sync');
const { readOnlyEVMFromMirrorNode } = require('../utils/solidityHelpers');
const { clearNFTAllowances } = require('../utils/hederaHelpers');

let operatorKey = PrivateKey.fromStringED25519(process.env.PRIVATE_KEY);
let operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

let iface, client;

const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);

const env = process.env.ENVIRONMENT ?? null;

const main = async () => {

	if (operatorId == null || operatorId == undefined) {
		console.log('OPERATOR_ID must be set in the .env file');
		return;
	}

	const args = process.argv.slice(2);

	if (getArgFlag('h') || args.length != 2) {
		console.log('Usage: revokeNFTAllAllowance.js <tokenId> <spender>');
		return;
	}

	console.log(' -Using Environmenmt:', env);

	const token = TokenId.fromString(args[0]);
	const spender = AccountId.fromString(args[1]);

	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (env.toUpperCase() == 'TEST') {
		console.log('interacting in *TESTNET*');
		client = Client.forTestnet();
	}
	else if (env.toUpperCase() == 'MAIN') {
		console.log('interacting in *MAINNET*');
		client = Client.forMainnet();
	}
	else if (env.toUpperCase() == 'PREVIEW') {
		console.log('interacting in *PREVIEWNET*');
		client = Client.forPreviewnet();
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST or PREVIEW as environment in .env file');
		return;
	}

	client.setOperator(operatorId, operatorKey);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	console.log('\n -Loading ABI...\n');

	iface = new ethers.Interface(json.abi);

	const tokenIdSolidityList = [token.toSolidityAddress()];
	const spenderList = [spender.toSolidityAddress()];
	const operatorIdList = [operatorId.toSolidityAddress()];
	
	console.log(' -Checking allowance for:', token.toString(), 'from:', operatorId.toString(), 'to:', spender.toString());
	const encodedCommand = iface.encodeFunctionData('checkTokensApprovedForAllSerial', [tokenIdSolidityList, operatorIdList, spenderList], false);
	let result = await readOnlyEVMFromMirrorNode(env, contractId, encodedCommand, operatorId, false);
	let value = iface.decodeFunctionResult('checkTokensApprovedForAllSerial', result);

	if (value[0][0] == true) {
		console.log(' -Allowance found for:', token.toString(), 'from:', operatorId.toString(), 'to:', spender.toString());
	}
	else {
		console.log(' -No allowance found for:', token.toString(), 'from:', operatorId.toString(), 'to:', spender.toString());
		return;
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Contract:', contractId.toString(), 'with name:', contractName, 'and address:', contractId.toSolidityAddress());
	console.log('\n-Revoking *all serial* allowances for:', token.toString(), 'from:', spender.toString(), 'on behalf of:', operatorId.toString());

	const proceed = readlineSync.keyInYNStrict('Do you want to proceed?');

	if (!proceed) {
		console.log('Exiting...');
		return;
	}

	const nftAllowance = [{ tokenId: token, operatorId: operatorId, spender: spender }];

	const txResult = await clearNFTAllowances(client, nftAllowance);
	console.log(' -outcome:', txResult);

	// let mirror uodate
	await sleep(4500);

	// query again
	result = await readOnlyEVMFromMirrorNode(env, contractId, encodedCommand, operatorId, false);
	value = iface.decodeFunctionResult('checkTokensApprovedForAllSerial', result);

	if (value[0][0] == true) {
		console.log(' -Allowance found for:', token.toString(), 'from:', operatorId.toString(), 'to:', spender.toString());
	}
	else {
		console.log(' -No allowance found for:', token.toString(), 'from:', operatorId.toString(), 'to:', spender.toString());
		return;
	}
};


main()
	.then(() => {
		// eslint-disable-next-line no-useless-escape
		// process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});