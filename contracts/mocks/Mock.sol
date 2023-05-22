pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 totalSupply_
    ) public ERC20(_name, _symbol) {
        super._mint(msg.sender, totalSupply_);
    }
}
