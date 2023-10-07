const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
} = require('@hashgraph/sdk');
const fs = require('fs');
const readlineSync = require('readline-sync');
const { accountCreator } = require('../utils/hederaHelpers');
const { contractDeployFunction, linkBytecode } = require('../utils/solidityHelpers');

require('dotenv').config();

// Get operator from .env file
let operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
let operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;
const env = process.env.ENVIRONMENT ?? null;
let client;

// required Solidity libraries for deployment
const libraryNames = ['SafeHTS'];
const safeHTSDeployment = process.env.SAFE_HTS ?? null;

const main = async () => {
	if (!env || contractName === undefined || contractName == null) {
		console.log('Please specify ENVIRONMENT & CONTRACT_NAME for ABI in the .env file');
		return;
	}

	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('deploying in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('deploying in *MAINNET*');
	}
	else if (env.toUpperCase() == 'LOCAL') {
		const node = { '127.0.0.1:50211': new AccountId(3) };
		client = Client.forNetwork(node).setMirrorNetwork('127.0.0.1:5600');
		console.log('testing in *LOCAL*');
		// baseUrl = 'http://localhost:5551';
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

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());
	console.log('\n-Deploying Contract:', contractName);

	client.setOperator(operatorId, operatorKey);

	const gasLimit = 600_000;

	const execute = readlineSync.keyInYNStrict('Do wish to deploy?');
	if (execute) {
		const libraryDeployedIds = [];
		for (let i = 0; i < libraryNames.length; i++) {
			const libraryName = libraryNames[i];
			if (libraryName == 'SafeHTS' && safeHTSDeployment) {
				console.log('Skipping SafeHTS deployment as it is already deployed');
				libraryDeployedIds.push(ContractId.fromString(safeHTSDeployment));
				continue;
			}
			console.log('\n-Deploying library:', libraryName);

			const libraryBytecode = JSON.parse(fs.readFileSync(`./artifacts/contracts/${libraryName}.sol/${libraryName}.json`)).bytecode;

			libraryDeployedIds.push(await contractDeployFunction(client, libraryBytecode, gasLimit));
			console.log(`Library created with ID: ${libraryDeployedIds[i]} / ${libraryDeployedIds[i].toSolidityAddress()}`);
		}

		const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`));

		const contractBytecode = json.bytecode;

		// replace library address in bytecode
		console.log('\n-Linking library addresses in bytecode...');
		const readyToDeployBytecode = linkBytecode(contractBytecode, libraryNames, libraryDeployedIds);

		console.log('\n- Deploying contract...', contractName, '\n\tgas@', gasLimit);

		const [contractId, contractAddress] = await contractDeployFunction(client, readyToDeployBytecode, gasLimit);

		console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);
	}
	else {
		console.log('Aborting deployment');
	}

};

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
