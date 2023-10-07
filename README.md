# hedera-solidity-LSHUtility
Utility contracts

LSHUtilityNative -> precompile native method [Not ready for prod]

SafeHTS deployment & Live Allowance testing

Designed to be deployed with ability to receive funding to allow anyone to pay for the SC rent.

LSHUtilityERC -> using IERC20/721 implementations

node .\scripts\mirrorClaimQueryAllowance.js -t 0.0.499214 -s 0.0.1030 -ft -o 0.0.4499213
Alice account ID: 0.0.4499213 
Mirror node: FT allowance is 10 for 0.0.4499212 of 0.0.4499214
Mirror node: FT allowance is 7 for 0.0.1030 of 0.0.4499214