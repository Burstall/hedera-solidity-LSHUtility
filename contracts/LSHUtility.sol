// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.8 <0.9.0;

import { HederaResponseCodes } from "./HederaResponseCodes.sol";
import { SafeHTS } from "./SafeHTS.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

contract LSHUtility is Ownable {

	error InvalidArguments();

	event LSHUtilityEvent (
		address indexed sender,
		uint256 indexed value,
		string message
	);
	
	function checkLiveAllowance(address _token, address _owner, address _spender) public returns (uint256 allowance) {
		allowance = SafeHTS.safeAllowance(_token, _owner, _spender);
	}

	function isApprovedForAllSerials(address _token, address _owner, address _spender) public returns (bool isApproved) {
		isApproved = SafeHTS.safeIsApprovedForAll(_token, _owner, _spender);
	}

	function checkLiveAllowances(address[] memory _token, address[] memory _owner, address[] memory _spender) public returns (uint256[] memory allowances) {
		if (_token.length != _owner.length || _owner.length != _spender.length) {
			revert InvalidArguments();
		}
		allowances = new uint256[](_token.length);
		for (uint256 i = 0; i < _token.length; i++) {
			allowances[i] = checkLiveAllowance(_token[i], _owner[i], _spender[i]);
		}
	}
	
	function checkTokensApprovedForAllSerial(address[] memory _token, address[] memory _owner, address[] memory _spender) public returns (bool[] memory approvals) {
		if (_token.length != _owner.length || _owner.length != _spender.length) {
			revert InvalidArguments();
		}
		approvals = new bool[](_token.length);
		for (uint256 i = 0; i < _token.length; i++) {
			approvals[i] = isApprovedForAllSerials(_token[i], _owner[i], _spender[i]);
		}
	}

	function checkApprovedAddress(address _token, int64 serial) public returns (address approvedAddress) {
		approvedAddress = SafeHTS.safeGetApproved(_token, serial);
	}

	function checkApprovedAddresses(address[] memory _token, int64[] memory _serial) public returns (address[] memory approvedAddresses) {
		if (_token.length != _serial.length) {
			revert InvalidArguments();
		}
		approvedAddresses = new address[](_token.length);
		for (uint256 i = 0; i < _token.length; i++) {
			approvedAddresses[i] = checkApprovedAddress(_token[i], _serial[i]);
		}
	}

	/// @param receiverAddress address in EVM fomat of the reciever of the token
    /// @param amount number of tokens to send (in tinybar i.e. adjusted for decimal)
    function transferHbar(address payable receiverAddress, uint256 amount)
        external
        onlyOwner
    {
		if (receiverAddress == address(0) || amount == 0) {
			revert InvalidArguments();
		}

		Address.sendValue(receiverAddress, amount);

		emit LSHUtilityEvent(
			receiverAddress, 
			amount,
			"Hbar Transfer Complete"
		);
    }

	receive() external payable {
        emit LSHUtilityEvent(
            msg.sender,
            msg.value,
            "Recieved Hbar"
        );
    }

    fallback() external payable {
        emit LSHUtilityEvent(msg.sender, msg.value, "Fallback Called");
    }
}