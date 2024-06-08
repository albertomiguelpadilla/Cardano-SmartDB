import {
    BackEndApiHandlersFor,
    BackEndAppliedFor,
    BaseSmartDBBackEndApiHandlers,
    BaseSmartDBBackEndApplied,
    BaseSmartDBBackEndMethods,
    LucidToolsBackEnd,
    Maybe,
    NextApiRequestAuthenticated,
    TRANSACTION_STATUS_PENDING,
    TimeBackEnd,
    TransactionBackEndApplied,
    TransactionDatum,
    TransactionEntity,
    TransactionRedeemer,
    WalletTxParams,
    addAssetsList,
    addressToPubKeyHash,
    calculateMinAdaOfUTxO,
    console_error,
    console_log,
    isEmulator,
    objToCborHex,
    optionsGetAllFields,
    optionsGetMinimalWithSmartUTxO,
    sanitizeForDatabase,
    showData,
    strToHex,
} from 'smart-db/backEnd';
import { DummyEntity } from '../Entities/Dummy.Entity';
import { NextApiResponse } from 'next';
import { Assets, Tx } from 'lucid-cardano';
import { DummyPolicyRedeemerBurnID, DummyPolicyRedeemerMintID, DummyValidatorRedeemerClaim, DummyValidatorRedeemerDatumUpdate } from '../Entities/Redeemers/Dummy.Redeemer';
import { ClaimTxParams, CreateTxParams, DUMMY_CLAIM, DUMMY_CREATE, DUMMY_UPDATE, UpdateTxParams } from '../../Commons/Constants/transactions';

@BackEndAppliedFor(DummyEntity)
export class DummyBackEndApplied extends BaseSmartDBBackEndApplied {
    protected static _Entity = DummyEntity;
    protected static _BackEndMethods = BaseSmartDBBackEndMethods;
}

@BackEndApiHandlersFor(DummyEntity)
export class DummyTxApiHandlers extends BaseSmartDBBackEndApiHandlers {
    protected static _Entity = DummyEntity;
    protected static _BackEndApplied = DummyBackEndApplied;

    // #region custom api handlers

    protected static _ApiHandlers: string[] = ['tx'];

    protected static async executeApiHandlers(command: string, req: NextApiRequestAuthenticated, res: NextApiResponse) {
        //--------------------
        const { query } = req.query;
        //--------------------
        if (this._ApiHandlers.includes(command) && query !== undefined) {
            if (query[0] === 'tx') {
                if (query.length === 2) {
                    if (query[1] === 'create-dummy-tx') {
                        return await this.createTxApiHandler(req, res);
                    } else if (query[1] === 'claim-dummy-tx') {
                        return await this.claimTxApiHandler(req, res);
                    } else if (query[1] === 'update-dummy-tx') {
                        return await this.updateTxApiHandler(req, res);
                    }
                }
                return res.status(405).json({ error: `Wrong Api route` });
            } else {
                console_error(0, this._Entity.className(), `executeApiHandlers - Error: Api Handler function not found`);
                return res.status(500).json({ error: `Api Handler function not found` });
            }
        } else {
            console_error(0, this._Entity.className(), `executeApiHandlers - Error: Wrong Custom Api route`);
            return res.status(405).json({ error: `Wrong Custom Api route` });
        }
    }
    
    // #endregion custom api handlers

    // #region api tx handlers

    public static async createTxApiHandler(req: NextApiRequestAuthenticated, res: NextApiResponse) {
        //--------------------
        if (req.method === 'POST') {
            console_log(1, this._Entity.className(), `Create Tx - POST - Init`);
            try {
                //-------------------------
                const sanitizedBody = sanitizeForDatabase(req.body);
                //-------------------------
                const { walletTxParams, txParams }: { walletTxParams: WalletTxParams; txParams: CreateTxParams } = sanitizedBody;
                //--------------------------------------
                console_log(0, this._Entity.className(), `Create Tx - txParams: ${showData(txParams)}`);
                //--------------------------------------
                if (isEmulator) {
                    // solo en emulator. Me aseguro de setear el emulador al tiempo real del server. Va a saltear los slots necesarios.
                    // await TimeBackEnd.syncBlockChainWithServerTime()
                }
                //--------------------------------------
                const { lucid } = await LucidToolsBackEnd.prepareLucidBackEndForTx(walletTxParams);
                //--------------------------------------
                const { utxos: uTxOsAtWallet, address } = walletTxParams;
                //--------------------------------------
                const { ddValue, datumID_CS, datumID_TN, validatorAddress, mintingIdDummy } = txParams;
                //--------------------------------------
                const lucidAC_MintID = datumID_CS + strToHex(datumID_TN);
                const valueFor_Mint_ID: Assets = { [lucidAC_MintID]: 1n };
                console_log(0, this._Entity.className(), `Create Tx - valueFor_Mint_ID: ${showData(valueFor_Mint_ID)}`);
                //----------------------------
                let valueFor_DummyDatum_Out: Assets = valueFor_Mint_ID;
                const minADA_For_DummyDatum = calculateMinAdaOfUTxO({ assets: valueFor_DummyDatum_Out });
                const value_MinAda_For_DummyDatum: Assets = { lovelace: minADA_For_DummyDatum };
                valueFor_DummyDatum_Out = addAssetsList([value_MinAda_For_DummyDatum, valueFor_DummyDatum_Out]);
                console_log(0, this._Entity.className(), `Create Tx - valueFor_FundDatum_Out: ${showData(valueFor_DummyDatum_Out, false)}`);
                //--------------------------------------
                const paymentPKH = addressToPubKeyHash(address);
                const datumPlainObject = {
                    ddPaymentPKH: paymentPKH,
                    ddStakePKH: new Maybe(),
                    ddValue: BigInt(ddValue),
                };
                //--------------------------------------
                let dummyDatum_Out = DummyEntity.mkDatumFromPlainObject(datumPlainObject);
                console_log(0, this._Entity.className(), `Create Tx - dummyDatum_Out: ${showData(dummyDatum_Out, false)}`);
                const dummyDatum_Out_Hex = DummyEntity.datumToCborHex(dummyDatum_Out);
                console_log(0, this._Entity.className(), `Create Tx - dummyDatum_Out_Hex: ${showData(dummyDatum_Out_Hex, false)}`);
                //--------------------------------------
                const dummyPolicyRedeemerMintID = new DummyPolicyRedeemerMintID();
                console_log(0, this._Entity.className(), `Create Tx - dummyPolicyRedeemerMintID: ${showData(dummyPolicyRedeemerMintID, false)}`);
                const dummyPolicyRedeemerMintID_Hex = objToCborHex(dummyPolicyRedeemerMintID);
                console_log(0, this._Entity.className(), `Create Tx - dummyPolicyRedeemerMintID_Hex: ${showData(dummyPolicyRedeemerMintID_Hex, false)}`);
                //--------------------------------------
                const { from, until } = await TimeBackEnd.getTxTimeRange();
                console_log(0, this._Entity.className(), `Create Tx - from ${from} to ${until}`);
                //--------------------------------------
                let tx: Tx = lucid.newTx();
                //--------------------------------------
                tx = await tx
                    .mintAssets(valueFor_Mint_ID, dummyPolicyRedeemerMintID_Hex)
                    .payToContract(validatorAddress, { inline: dummyDatum_Out_Hex }, valueFor_DummyDatum_Out)
                    .attachMintingPolicy(mintingIdDummy);
                //--------------------------------------
                const txComplete = await tx.complete();
                //--------------------------------------
                const txCborHex = txComplete.toString();
                //--------------------------------------
                const txHash = txComplete.toHash();
                //--------------------------------------
                const transactionDummyPolicyRedeemerMintID: TransactionRedeemer = {
                    tx_index: 0,
                    purpose: 'mint',
                    redeemerObj: dummyPolicyRedeemerMintID,
                };
                //--------------------------------------
                const transactionDummyDatum_Out: TransactionDatum = {
                    address: validatorAddress,
                    datumType: DummyEntity.className(),
                    datumObj: dummyDatum_Out,
                };
                //--------------------------------------
                const transaction: TransactionEntity = new TransactionEntity({
                    paymentPKH: walletTxParams.pkh,
                    date: new Date(from),
                    type: DUMMY_CREATE,
                    hash: txHash,
                    status: TRANSACTION_STATUS_PENDING,
                    ids: {},
                    redeemers: {
                        dummyPolicyRedeemerMintID: transactionDummyPolicyRedeemerMintID,
                    },
                    datums: { dummyDatum_Out: transactionDummyDatum_Out },
                    consuming_UTxOs: [],
                });
                await TransactionBackEndApplied.create(transaction);
                //--------------------------------------
                console_log(-1, this._Entity.className(), `Create Tx - txCborHex: ${showData(txCborHex)}`);
                return res.status(200).json({ txCborHex });
                //--------------------------------------
            } catch (error) {
                console_error(-1, this._Entity.className(), `Create Tx - Error: ${error}`);
                return res.status(500).json({ error: `An error occurred while creating the ${this._Entity.apiRoute()} Create Tx: ${error}` });
            }
        } else {
            console_error(-1, this._Entity.className(), `Create Tx - Error: Method not allowed`);
            return res.status(405).json({ error: `Method not allowed` });
        }
    }

    public static async claimTxApiHandler(req: NextApiRequestAuthenticated, res: NextApiResponse) {
        //--------------------
        if (req.method === 'POST') {
            console_log(1, this._Entity.className(), `Claim Tx - POST - Init`);
            try {
                //-------------------------
                const sanitizedBody = sanitizeForDatabase(req.body);
                //-------------------------
                const { walletTxParams, txParams }: { walletTxParams: WalletTxParams; txParams: ClaimTxParams } = sanitizedBody;
                //--------------------------------------
                console_log(0, this._Entity.className(), `Claim Tx - txParams: ${showData(txParams)}`);
                //--------------------------------------
                if (isEmulator) {
                    // solo en emulator. Me aseguro de setear el emulador al tiempo real del server. Va a saltear los slots necesarios.
                    // await TimeBackEnd.syncBlockChainWithServerTime()
                }
                //--------------------------------------
                const { lucid } = await LucidToolsBackEnd.prepareLucidBackEndForTx(walletTxParams);
                //--------------------------------------
                const { utxos: uTxOsAtWallet, address } = walletTxParams;
                //--------------------------------------
                const { datumID_CS, datumID_TN, mintingIdDummy, validatorDummy, dummy_id } = txParams;
                //--------------------------------------
                const dummy = await DummyBackEndApplied.getById_<DummyEntity>(dummy_id, {
                    ...optionsGetMinimalWithSmartUTxO,
                });
                if (dummy === undefined) {
                    throw `Invalid dummy id`;
                }
                //--------------------------------------
                const dummy_SmartUTxO = dummy.smartUTxO;
                if (dummy_SmartUTxO === undefined) {
                    throw `Can't find Dummy UTxO`;
                }
                if (dummy_SmartUTxO.isPreparing !== undefined || dummy_SmartUTxO.isConsuming !== undefined) {
                    throw `Dummy UTxO is being used, please wait and try again`;
                }
                //--------------------------------------
                const lucidAC_BurnID = datumID_CS + strToHex(datumID_TN);
                const valueFor_Burn_ID: Assets = { [lucidAC_BurnID]: -1n };
                console_log(0, this._Entity.className(), `Claim Tx - valueFor_Burn_ID: ${showData(valueFor_Burn_ID)}`);
                //----------------------------
                const dummyPolicyRedeemerBurnID = new DummyPolicyRedeemerBurnID();
                console_log(0, this._Entity.className(), `Claim Tx - dummyPolicyRedeemerBurnID: ${showData(dummyPolicyRedeemerBurnID, false)}`);
                const dummyPolicyRedeemerBurnID_Hex = objToCborHex(dummyPolicyRedeemerBurnID);
                console_log(0, this._Entity.className(), `Claim Tx - dummyPolicyRedeemerBurnID_Hex: ${showData(dummyPolicyRedeemerBurnID_Hex, false)}`);
                //--------------------------------------
                const dummyValidatorRedeemerClaim = new DummyValidatorRedeemerClaim();
                console_log(0, this._Entity.className(), `Claim Tx - dummyValidatorRedeemerClaim: ${showData(dummyValidatorRedeemerClaim, false)}`);
                const dummyValidatorRedeemerClaim_Hex = objToCborHex(dummyValidatorRedeemerClaim);
                console_log(0, this._Entity.className(), `Claim Tx - dummyValidatorRedeemerClaim_Hex: ${showData(dummyValidatorRedeemerClaim_Hex, false)}`);
                //--------------------------------------
                const { from, until } = await TimeBackEnd.getTxTimeRange();
                console_log(0, this._Entity.className(), `Claim Tx - from ${from} to ${until}`);
                //--------------------------------------
                let tx: Tx = lucid.newTx();
                //--------------------------------------
                tx = await tx
                    .mintAssets(valueFor_Burn_ID, dummyPolicyRedeemerBurnID_Hex)
                    .collectFrom([dummy_SmartUTxO], dummyValidatorRedeemerClaim_Hex)
                    .attachMintingPolicy(mintingIdDummy)
                    .attachSpendingValidator(validatorDummy)
                    .addSigner(address);
                //----------------------------
                const txComplete = await tx.complete();
                //--------------------------------------
                const txCborHex = txComplete.toString();
                //--------------------------------------
                const txHash = txComplete.toHash();
                //--------------------------------------
                const transactionDummyPolicyRedeemerBurnID: TransactionRedeemer = {
                    tx_index: 0,
                    purpose: 'mint',
                    redeemerObj: dummyPolicyRedeemerBurnID,
                };
                //--------------------------------------
                const transactionDummyValidatorRedeemerClaim: TransactionRedeemer = {
                    tx_index: 0,
                    purpose: 'spend',
                    redeemerObj: dummyValidatorRedeemerClaim,
                };
                //--------------------------------------
                const transactionDummyDatum_In: TransactionDatum = {
                    address: dummy_SmartUTxO.address,
                    datumType: DummyEntity.className(),
                    datumObj: dummy_SmartUTxO.datumObj,
                };
                //--------------------------------------
                const transaction: TransactionEntity = new TransactionEntity({
                    paymentPKH: walletTxParams.pkh,
                    date: new Date(from),
                    type: DUMMY_CLAIM,
                    hash: txHash,
                    status: TRANSACTION_STATUS_PENDING,
                    ids: {},
                    redeemers: {
                        dummyPolicyRedeemerBurnID: transactionDummyPolicyRedeemerBurnID,
                        dummyValidatorRedeemerClaim: transactionDummyValidatorRedeemerClaim,
                    },
                    datums: { dummyDatum_In: transactionDummyDatum_In },
                    consuming_UTxOs: [dummy_SmartUTxO],
                });
                await TransactionBackEndApplied.create(transaction);
                //--------------------------------------
                console_log(-1, this._Entity.className(), `Claim Tx - txCborHex: ${showData(txCborHex)}`);
                return res.status(200).json({ txCborHex });
                //--------------------------------------
            } catch (error) {
                console_error(-1, this._Entity.className(), `Claim Tx - Error: ${error}`);
                return res.status(500).json({ error: `An error occurred while creating the ${this._Entity.apiRoute()} Claim Tx: ${error}` });
            }
        } else {
            console_error(-1, this._Entity.className(), `Claim Tx - Error: Method not allowed`);
            return res.status(405).json({ error: `Method not allowed` });
        }
    }

    public static async updateTxApiHandler(req: NextApiRequestAuthenticated, res: NextApiResponse) {
        //--------------------
        if (req.method === 'POST') {
            console_log(1, this._Entity.className(), `Update Tx - POST - Init`);
            try {
                //-------------------------
                const sanitizedBody = sanitizeForDatabase(req.body);
                //-------------------------
                const { walletTxParams, txParams }: { walletTxParams: WalletTxParams; txParams: UpdateTxParams } = sanitizedBody;
                //--------------------------------------
                console_log(0, this._Entity.className(), `Update Tx - txParams: ${showData(txParams)}`);
                //--------------------------------------
                if (isEmulator) {
                    // solo en emulator. Me aseguro de setear el emulador al tiempo real del server. Va a saltear los slots necesarios.
                    // await TimeBackEnd.syncBlockChainWithServerTime()
                }
                //--------------------------------------
                const { lucid } = await LucidToolsBackEnd.prepareLucidBackEndForTx(walletTxParams);
                //--------------------------------------
                const { utxos: uTxOsAtWallet, address } = walletTxParams;
                //--------------------------------------
                const { ddValue, datumID_CS, datumID_TN, dummy_id, validatorAddress, validatorDummy } = txParams;
                //--------------------------------------
                const lucidAC_ID = datumID_CS + strToHex(datumID_TN);
                const valueFor_ID: Assets = { [lucidAC_ID]: 1n };
                console_log(0, this._Entity.className(), `Update Tx - valueFor_ID: ${showData(valueFor_ID)}`);
                //--------------------------------------
                const dummy = await DummyBackEndApplied.getById_<DummyEntity>(dummy_id, {
                    ...optionsGetMinimalWithSmartUTxO,
                });
                if (dummy === undefined) {
                    throw `Invalid dummy id`;
                }
                //--------------------------------------
                const dummy_SmartUTxO = dummy.smartUTxO;
                if (dummy_SmartUTxO === undefined) {
                    throw `Can't find Dummy UTxO`;
                }
                if (dummy_SmartUTxO.isPreparing !== undefined || dummy_SmartUTxO.isConsuming !== undefined) {
                    throw `Dummy UTxO is being used, please wait and try again`;
                }
                //--------------------------------------
                const paymentPKH = addressToPubKeyHash(address);
                const datumPlainObject = {
                    ddPaymentPKH: paymentPKH,
                    ddStakePKH: new Maybe(),
                    ddValue: BigInt(ddValue),
                };
                //--------------------------------------
                let valueFor_DummyDatum_Out = dummy_SmartUTxO.assets;
                //--------------------------------------
                let dummyDatum_Out = DummyEntity.mkDatumFromPlainObject(datumPlainObject);
                console_log(0, this._Entity.className(), `Update Tx - dummyDatum_Out: ${showData(dummyDatum_Out, false)}`);
                const dummyDatum_Out_Hex = DummyEntity.datumToCborHex(dummyDatum_Out);
                console_log(0, this._Entity.className(), `Update Tx - dummyDatum_Out_Hex: ${showData(dummyDatum_Out_Hex, false)}`);
                //--------------------------------------
                const dummyValidatorRedeemerDatumUpdate = new DummyValidatorRedeemerDatumUpdate();
                console_log(0, this._Entity.className(), `Update Tx - dummyValidatorRedeemerDatumUpdate: ${showData(dummyValidatorRedeemerDatumUpdate, false)}`);
                const dummyValidatorRedeemerDatumUpdate_Hex = objToCborHex(dummyValidatorRedeemerDatumUpdate);
                console_log(0, this._Entity.className(), `Update Tx - dummyValidatorRedeemerDatumUpdate_Hex: ${showData(dummyValidatorRedeemerDatumUpdate_Hex, false)}`);
                //--------------------------------------
                const { from, until } = await TimeBackEnd.getTxTimeRange();
                console_log(0, this._Entity.className(), `Claim Tx - from ${from} to ${until}`);
                //--------------------------------------
                let tx: Tx = lucid.newTx();
                //--------------------------------------
                tx = await tx
                    .collectFrom([dummy_SmartUTxO], dummyValidatorRedeemerDatumUpdate_Hex)
                    .payToContract(validatorAddress, { inline: dummyDatum_Out_Hex }, valueFor_DummyDatum_Out)
                    .attachSpendingValidator(validatorDummy)
                    .addSigner(address);
                //--------------------------------------
                const txComplete = await tx.complete();
                //--------------------------------------
                const txCborHex = txComplete.toString();
                //--------------------------------------
                const txHash = txComplete.toHash();
                //--------------------------------------
                const transactionDummyValidatorRedeemerDatumUpdate: TransactionRedeemer = {
                    tx_index: 0,
                    purpose: 'spend',
                    redeemerObj: dummyValidatorRedeemerDatumUpdate,
                };
                //--------------------------------------
                const transactionDummyDatum_In: TransactionDatum = {
                    address: validatorAddress,
                    datumType: DummyEntity.className(),
                    datumObj: dummy_SmartUTxO.datumObj,
                };
                //--------------------------------------
                const transactionDummyDatum_Out: TransactionDatum = {
                    address: validatorAddress,
                    datumType: DummyEntity.className(),
                    datumObj: dummyDatum_Out,
                };
                //--------------------------------------
                const transaction: TransactionEntity = new TransactionEntity({
                    paymentPKH: walletTxParams.pkh,
                    date: new Date(from),
                    type: DUMMY_UPDATE,
                    hash: txHash,
                    status: TRANSACTION_STATUS_PENDING,
                    ids: {},
                    redeemers: {
                        dummyValidatorRedeemerDatumUpdate: transactionDummyValidatorRedeemerDatumUpdate,
                    },
                    datums: { dummyDatum_In: transactionDummyDatum_In, dummyDatum_Out: transactionDummyDatum_Out },
                    consuming_UTxOs: [dummy_SmartUTxO],
                });
                await TransactionBackEndApplied.create(transaction);
                //--------------------------------------
                console_log(-1, this._Entity.className(), `Update Tx - txCborHex: ${showData(txCborHex)}`);
                return res.status(200).json({ txCborHex });
                //--------------------------------------
            } catch (error) {
                console_error(-1, this._Entity.className(), `Update Tx - Error: ${error}`);
                return res.status(500).json({ error: `An error occurred while creating the ${this._Entity.apiRoute()} Update Tx: ${error}` });
            }
        } else {
            console_error(-1, this._Entity.className(), `Update Tx - Error: Method not allowed`);
            return res.status(405).json({ error: `Method not allowed` });
        }
    }

    // #endregion api tx handlers
}
