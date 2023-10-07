const fs = require('fs');
const { ethers } = require('ethers');
const { expect, assert } = require('chai');
const { describe, it } = require('mocha');
const {
	Client,
	AccountId,
	PrivateKey,
	Hbar,
	// eslint-disable-next-line no-unused-vars
	ContractFunctionParameters,
	HbarUnit,
	ContractExecuteTransaction,
	// eslint-disable-next-line no-unused-vars
	TokenId,
	// eslint-disable-next-line no-unused-vars
	ContractId,

} = require('@hashgraph/sdk');

const { contractExecuteFunction, contractDeployFunction } = require('../utils/solidityHelpers');
const { accountCreator, mintFT, sendFT, sendNFT, setFTAllowance, setNFTAllowance, setNFTAllowanceAll, sendNFTWithAllowance, sendFTWithAllowance, sendHbar, associateTokenToAccount, mintNFT } = require('../utils/hederaHelpers');
const { checkMirrorAllowance, checkMirrorNFTAllowance, checkLastMirrorEvent, checkMirrorBalance } = require('../utils/hederaMirrorHelpers');
require('dotenv').config();

// Get operator from .env file
let operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
let operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = 'LSHUtilityERC';
const env = process.env.ENVIRONMENT ?? null;

const addressRegex = /(\d+\.\d+\.[1-9]\d+)/i;

// reused variable
let contractId;
let contractAddress;
let iface;
let alicePK, aliceId;
let NFTTokenId, FTTokenId;
let client;

describe('Deployment: ', function() {
	it('Should deploy the contract and setup conditions', async function() {
		if (operatorKey === undefined || operatorKey == null || operatorId === undefined || operatorId == null) {
			console.log('Environment required, please specify PRIVATE_KEY & ACCOUNT_ID in the .env file');
			process.exit(1);
		}

		console.log('\n-Using ENIVRONMENT:', env);

		if (env.toUpperCase() == 'TEST') {
			client = Client.forTestnet();
			console.log('testing in *TESTNET*');
		}
		else if (env.toUpperCase() == 'MAIN') {
			client = Client.forMainnet();
			console.log('testing in *MAINNET*');
		}
		else if (env.toUpperCase() == 'LOCAL') {
			const node = { '127.0.0.1:50211': new AccountId(3) };
			client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
			console.log('testing in *LOCAL*');
			const rootId = AccountId.fromString('0.0.2');
			const rootKey = PrivateKey.fromString('302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137');

			// create an operator account on the local node and use this for testing as operator
			client.setOperator(rootId, rootKey);
			operatorKey = PrivateKey.generateED25519();
			operatorId = await accountCreator(client, operatorKey, 1000);
		}
		else {
			console.log('ERROR: Must specify either MAIN or TEST or LOCAL as environment in .env file');
			return;
		}

		client.setOperator(operatorId, operatorKey);
		// deploy the contract
		console.log('\n-Using Operator:', operatorId.toString());

		const gasLimit = 600000;


		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		// import ABI
		iface = ethers.Interface.from(json.abi);

		const contractBytecode = json.bytecode;


		console.log('\n- Deploying contract...', contractName, '\n\tgas@', gasLimit);

		[contractId, contractAddress] = await contractDeployFunction(client, contractBytecode, gasLimit);

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

		console.log('\n-Testing:', contractName);
		// create Alice account
		alicePK = PrivateKey.generateED25519();
		aliceId = await accountCreator(client, alicePK, 10);
		console.log('Alice account ID:', aliceId.toString(), '\nkey:', alicePK.toString());

		expect(contractId.toString().match(addressRegex).length == 2).to.be.true;
	});

	it('Operator mints a new FT and sends some to Alice', async function() {
		client.setOperator(operatorId, operatorKey);
		let result;
		[result, FTTokenId] = await mintFT(client, operatorId, null, 100000, 'TestFrameworkToken_FT' + aliceId.toString(), 'TFT_FT', 1);
		expect(result).to.be.equal('SUCCESS');
		console.log('\n- FT minted @', FTTokenId.toString());

		// associate the FT
		client.setOperator(aliceId, alicePK);
		result = await associateTokenToAccount(client, aliceId, alicePK, FTTokenId);
		expect(result).to.be.equal('SUCCESS');

		client.setOperator(operatorId, operatorKey);
		result = await sendFT(client, FTTokenId, 1000, operatorId, aliceId, 'TestFramework test FT transfer');
		expect(result).to.be.equal('SUCCESS');
	});

	it('Operator mints a new NFT with royalties and sends to Alice', async function() {
		client.setOperator(operatorId, operatorKey);
		let result;
		[result, NFTTokenId] = await mintNFT(
			client,
			operatorId,
			'TestFrameworkTestNFT ' + operatorId.toString(),
			'TFTNFT',
		);
		console.log('\n- NFT minted @', NFTTokenId.toString());
		expect(result).to.be.equal('SUCCESS');

		// associate the NFT
		client.setOperator(aliceId, alicePK);
		result = await associateTokenToAccount(client, aliceId, alicePK, NFTTokenId);
		expect(result).to.be.equal('SUCCESS');

		client.setOperator(operatorId, operatorKey);
		result = await sendNFT(client, operatorId, aliceId, NFTTokenId, [1, 2, 3]);
		expect(result).to.be.equal('SUCCESS');
	});
});

describe('Testing Allowances: ', function() {
	it('Alice approves Operator to spend 9 FT', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setFTAllowance(client, FTTokenId, aliceId, operatorId, 9);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice approves Contract to spend 10 FT', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setFTAllowance(client, FTTokenId, aliceId, AccountId.fromEvmAddress(0, 0, contractAddress), 10);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice approves Contract to spend NFT Serial 2 and Operator to spend Serial 3', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setNFTAllowance(client, NFTTokenId, aliceId, [AccountId.fromEvmAddress(0, 0, contractAddress), operatorId], [2, 3]);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice approves Operator to spend *ALL* NFT', async function() {
		client.setOperator(aliceId, alicePK);
		const result = await setNFTAllowanceAll(client, NFTTokenId, aliceId, operatorId);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Alice checks the FT approval in EVM', async function() {
		client.setOperator(aliceId, alicePK);
		let [status, allowance] = await checkApprovalFcn(FTTokenId, aliceId, contractId);
		console.log('EVM: FT allowance is', allowance, 'for', contractId.toString(), 'of', FTTokenId.toString());
		expect(allowance).to.be.equal(10);
		expect(status).to.be.equal('SUCCESS');
		[status, allowance] = await checkApprovalFcn(FTTokenId, aliceId, operatorId);
		console.log('EVM: FT allowance is', allowance, 'for', operatorId.toString(), 'of', FTTokenId.toString());
		expect(allowance).to.be.equal(9);
		expect(status).to.be.equal('SUCCESS');
	});

	it('Check FT allowance at Mirror nodes', async function() {
		// mirror nodes can have a small delay
		await sleep(2000);
		let allowance = await checkMirrorAllowance(env, aliceId, FTTokenId, contractId);
		expect(allowance).to.be.equal(10);
		console.log('Mirror node: FT allowance is', allowance, 'for', contractId.toString(), 'of', FTTokenId.toString());
		allowance = await checkMirrorAllowance(env, aliceId, FTTokenId, operatorId);
		expect(allowance).to.be.equal(9);
		console.log('Mirror node: FT allowance is', allowance, 'for', operatorId.toString(), 'of', FTTokenId.toString());
	});

	it('Alice checks the NFT approval for serials 2 & 3', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, approved] = await checkNFTSerialsApprovalFcn(NFTTokenId, [2, 3]);
		expect(approved[0].toString() == contractId.toString()).to.be.true;
		expect(approved[1].toString() == operatorId.toString()).to.be.true;
		expect(status).to.be.equal('SUCCESS');
	});

	it('Alice checks the NFT approval (all serials) for operator', async function() {
		client.setOperator(aliceId, alicePK);
		const [status, approved] = await checkNFTApprovalFcn(NFTTokenId, aliceId, operatorId);
		expect(approved).to.be.true;
		expect(status).to.be.equal('SUCCESS');
	});

	it('Check mirror nodes for NFT approval serials 2 & 3', async function() {
		// mirror nodes do not show 'all serials yet'
		let spender = await checkMirrorNFTAllowance(env, aliceId, NFTTokenId, 2);
		expect(spender).to.be.equal(contractId.toString());
		spender = await checkMirrorNFTAllowance(env, aliceId, NFTTokenId, 3);
		expect(spender).to.be.equal(operatorId.toString());
	});

	it('Operator uses the FT approval', async function() {
		// query mirror node for FT balance
		const balance = await checkMirrorBalance(env, operatorId, FTTokenId);

		// spend 2 of the FT
		client.setOperator(operatorId, operatorKey);
		const result = await sendFTWithAllowance(client, FTTokenId, 2, aliceId, operatorId, 'TestFramework test FT transfer (with Allowance)');
		expect(result).to.be.equal('SUCCESS');

		// check the balance changed
		await sleep(6000);
		const newBalance = await checkMirrorBalance(env, operatorId, FTTokenId);
		expect(newBalance).to.be.equal(balance + 2);
	});

	it('Operator uses the NFT approval for serials 2 and 3', async function() {
		client.setOperator(operatorId, operatorKey);
		const result = await sendNFTWithAllowance(client, NFTTokenId, [2, 3], [aliceId, aliceId], [operatorId, operatorId]);
		expect(result).to.be.equal('SUCCESS');
	});

	it('Check mirror node for allowance', async function() {
		// mirror nodes have a small delay
		await sleep(2000);
		let allowance = await checkMirrorAllowance(env, aliceId, FTTokenId, contractId);
		expect(allowance).to.be.equal(10);
		console.log('Mirror node: FT allowance is', allowance, 'for', contractId.toString(), 'of', FTTokenId.toString());
		allowance = await checkMirrorAllowance(env, aliceId, FTTokenId, operatorId);
		expect(allowance).to.be.equal(7);
		console.log('Mirror node: FT allowance is', allowance, 'for', operatorId.toString(), 'of', FTTokenId.toString());
	});

	it('operator checks Contract for the live allowances', async function() {
		client.setOperator(operatorId, operatorKey);
		const [status, allowance] = await checkApprovalArrayFcn([FTTokenId, FTTokenId], [aliceId, aliceId], [contractId, operatorId]);
		console.log('Contract: FT allowance is', allowance);
		expect(allowance[0]).to.be.equal(10);
		expect(allowance[1]).to.be.equal(7);
		expect(status).to.be.equal('SUCCESS');
	});

	it('Check live allowances via Mirror EVM', async function() {
		// call to the EVM via mirror node
		assert.fail('Not implemented yet');
	});
});

describe('Testing Errors: ', function() {
	it('Operator sends bad arguments and gets back a custom error', async function() {
		client.setOperator(operatorId, operatorKey);
		let errorCount = 0;
		const [result] = await contractExecuteFunction(contractId, iface, client, 200_000, 'checkApprovedAddresses', [[NFTTokenId.toSolidityAddress()], [1, 2]]);
		if (result?.status?.name == 'InvalidArguments') {
			errorCount++;
		}

		expect(errorCount).to.equal(1);
	});
});

describe('Testing Transfers: ', function() {
	it('Operator sends 5 tinybar to Contract', async function() {
		client.setOperator(operatorId, operatorKey);
		const result = await sendHbar(client, operatorId, AccountId.fromEvmAddress(0, 0, contractAddress), 5, HbarUnit.Tinybar);
		expect(result).to.be.equal('SUCCESS');
	});

	it('verify Recieve() via HTS send from mirror node', async function() {
		// sending native hbar will not trigger the receive function
		await sleep(5000);
		const result = Number(await checkLastMirrorEvent(env, contractId, iface));
		expect(result).to.be.NaN;
	});

	it('Operator triggers fallback', async function() {
		client.setOperator(operatorId, operatorKey);
		const result = await triggerFallback(8, HbarUnit.Tinybar);
		expect(result).to.be.equal('SUCCESS');
	});

	it('verify Fallback from mirror node', async function() {
		await sleep(5000);
		const result = await checkLastMirrorEvent(env, contractId, iface);
		expect(result).to.be.equal(8);
	});
});

/**
 * Helper function to call a contract to check allowance
 * @param {TokenId} _tokenId
 * @param {AccountId} _ownerId
 * @param {ContractId} _spenderId
 * @returns {Number} allowance as a number
 */
async function checkApprovalFcn(_tokenId, _ownerId, _spenderId) {
	const [contractExecuteRx, contractResults] = await contractExecuteFunction(contractId, iface, client, 200_000, 'checkLiveAllowance',
		[_tokenId.toSolidityAddress(), _ownerId.toSolidityAddress(), _spenderId.toSolidityAddress()]);
	// console.log('Tx Id:', record.transactionId.toString());
	// console.log('allowance is ', contractResults);
	return [contractExecuteRx.status.toString(), Number(contractResults[0])];
}

/**
 * Bulck check of allowances
 * @param {TokenId[]} _tokenIdArray
 * @param {AccountId[]} _ownerId
 * @param {AccountId[]} _spenderId
 */
async function checkApprovalArrayFcn(_tokenIdArray, _ownerId, _spenderId) {
	if (_tokenIdArray.length != _ownerId.length || _tokenIdArray.length != _spenderId.length) {
		console.log('ERROR: Token, Owner and Spender must be the same length');
		return 'ERROR';
	}
	const solidityTokenArray = [];
	const soliditySpenderArray = [];
	const solidityOwnerArray = [];
	for (let i = 0; i < _tokenIdArray.length; i++) {
		solidityTokenArray.push(_tokenIdArray[i].toSolidityAddress());
		solidityOwnerArray.push(_ownerId[i].toSolidityAddress());
		soliditySpenderArray.push(_spenderId[i].toSolidityAddress());
	}
	const [contractExecuteRx, contractResults] = await contractExecuteFunction(contractId, iface, client, 500_000, 'checkLiveAllowances',
		[solidityTokenArray, solidityOwnerArray, soliditySpenderArray]);

	const results = [];
	// console.log('Results:', contractResults);
	for (let i = 0; i < contractResults[0].length; i++) {
		results.push(Number(contractResults[0][i]));
	}
	return [contractExecuteRx.status.toString(), results];
}

async function triggerFallback(_amt, hbarUnits = HbarUnit.Tinybar) {
	try {
		// calling a method that doesn't exist will trigger the fallback
		const encodedCommand = ethers.keccak256(ethers.toUtf8Bytes('triggerFallback()'));

		const contractExecuteTx = await new ContractExecuteTransaction()
			.setContractId(contractId)
			.setGas(100_000)
			.setFunctionParameters(Buffer.from(encodedCommand.slice(2), 'hex'))
			.setPayableAmount(new Hbar(_amt, hbarUnits))
			.execute(client);

		const contractExecuteRx = await contractExecuteTx.getReceipt(client);

		return contractExecuteRx.status.toString();
	}
	catch (e) {
		return e;
	}
}

/**
 * Helper function to call a contract to check allowance
 * @param {TokenId} _tokenId
 * @param {AccountId} _ownerId
 * @param {ContractId} _spenderId
 * @returns {Boolean} all serials approved
 */
async function checkNFTApprovalFcn(_tokenId, _ownerId, _spenderId) {
	const [contractExecuteRx, contractResults] = await contractExecuteFunction(contractId, iface, client, 200_000, 'isApprovedForAllSerials',
		[_tokenId.toSolidityAddress(), _ownerId.toSolidityAddress(), _spenderId.toSolidityAddress()]);
	return [contractExecuteRx.status.toString(), Boolean(contractResults[0])];
}

async function checkNFTSerialsApprovalFcn(_tokenId, _serialArray) {
	const tokenIdArray = [];
	const tokenSerialArray = [];
	for (let i = 0; i < _serialArray.length; i++) {
		tokenIdArray.push(_tokenId.toSolidityAddress());
		tokenSerialArray.push(_serialArray[i]);
	}
	const [contractExecuteRx, contractResults] = await contractExecuteFunction(contractId, iface, client, 200_000, 'checkApprovedAddresses',
		[tokenIdArray, tokenSerialArray]);

	const results = [];
	for (let i = 0; i < contractResults[0].length; i++) {
		results.push(AccountId.fromEvmAddress(0, 0, contractResults[0][i]));
	}
	return [contractExecuteRx.status.toString(), results];
}

/*
 * basic sleep function
 * @param {number} ms milliseconds to sleep
 * @returns {Promise}
 */
// eslint-disable-next-line no-unused-vars
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}