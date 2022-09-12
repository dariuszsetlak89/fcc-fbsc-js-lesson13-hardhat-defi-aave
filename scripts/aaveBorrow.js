const { ethers, getNamedAccounts, network } = require("hardhat");
const { BigNumber } = require("@ethersproject/bignumber");
const { getWeth, AMOUNT } = require("../scripts/getWeth.js");
const { networkConfig } = require("../helper-hardhat-config");

async function main() {
    // Aave protocol threats everything as a ERC-20 token
    await getWeth();
    const { deployer } = await getNamedAccounts();
    // abi, address

    // Lending Pool Address Provider address: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // Lending Pool address (get from Address Provider): ^
    const lendingPool = await getLendingPool(deployer);
    console.log(`LendingPool address ${lendingPool.address}`);

    // Deposit!
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    // approve
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer);
    console.log("Depositing WETH...");
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0);
    console.log("Deposited!");

    // Get borrow user data:
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer);

    // Get DAI price:
    const daiPrice = await getDaiPrice();

    // Amount of DAI we can bororw - we will grab 95% of it
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber());
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString());
    console.log(`You can borrow ${amountDaiToBorrow.toString()} DAI`);

    // Borrow!
    // how much we have borrowed, how much we have in collateral, how much we can borrow
    await borrowDai(
        networkConfig[network.config.chainId].daiToken,
        lendingPool,
        amountDaiToBorrowWei,
        deployer
    );
    await getBorrowUserData(lendingPool, deployer);

    // Repay the borrow!
    await repay(
        amountDaiToBorrowWei,
        networkConfig[network.config.chainId].daiToken,
        lendingPool,
        deployer
    );
    await getBorrowUserData(lendingPool, deployer);
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    );
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool();
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account);
    return lendingPool;
}

async function approveErc20(erc20Address, spenderAddress, amount, signer) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, signer);
    txResponse = await erc20Token.approve(spenderAddress, amount);
    await txResponse.wait(1);
    console.log("Approved!");
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account);
    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`);
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`);
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`);
    return { availableBorrowsETH, totalDebtETH };
}

async function getDaiPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[network.config.chainId].daiEthPriceFeed
    );
    const price = (await daiEthPriceFeed.latestRoundData())[1];
    console.log(`The DAI/ETH price is ${price.toString()}`);
    return price;
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrow, account) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrow, 1, 0, account);
    await borrowTx.wait(1);
    console.log("You've borrowed!");
}

async function repay(amount, daiAddress, lendingPool, account) {
    await approveErc20(daiAddress, lendingPool.address, amount, account);
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account);
    await repayTx.wait(1);
    console.log("Repaid!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
