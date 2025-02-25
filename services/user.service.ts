import { ObjectId } from "mongodb";
import User from "../models/user.model";
import Event from "../models/event.model";
import { Transaction } from "../models/user.model";
import axios from "axios";
import { createPaymentLogService } from "./log.service";

const signUpService = async (userBody: any) => {
  const user = await User.create(userBody);
  return user;
};

const findUserService = async (param: any) => {
  const user = await User.findOne(param);
  return user;
};

const verifyToken = async (userBody: any) => {
  const user: any = await User.findByIdAndUpdate(userBody._id, {
    verified: true,
  });
  return user;
};

const updateUserService = async (userId: any, userBody: any) => {
  const user: any = await User.findByIdAndUpdate(userId, userBody, {
    new: true,
  });
  return user;
};

const resetPasswordService = async (userId: any, newPassword: any) => {
  const user: any = await User.findById(userId);
  user.password = newPassword;
  await user.save();
};

const getAllUsersService = async () => {
  const users: any = await User.find().select("-password");
  return users;
};

const fetchEspekroIdService = async (espektroId: any) => {
  return await User.find({ espektroId: espektroId }).select(
    "name email espektroId college degree year stream -_id",
  );
};

const addReferralCodeService = async (userId: any, referralCode: string) => {
  return await User.findByIdAndUpdate(userId, { referralCode: referralCode });
};

const updatePrizeWinnerService = async (
  userId: any,
  eventName: string,
  eventId: any,
  position: number,
  prize: string,
) => {
  const user: any = await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        eventWinList: {
          eventName: eventName,
          eventId: eventId,
          position: position,
          prize: prize,
        },
      },
    },
    { new: true },
  );
  await Event.findByIdAndUpdate(eventId, {
    $push: {
      eventWinList: {
        userId: userId,
        userName: user.name,
        userCollege: user.college,
        position: position,
        prize: prize,
      },
    },
  });
  return user;
};

const getTransactionByUserIdService = async (userId: any) => {
  return await Transaction.find({ userId: userId });
};

// create transaction for payment - razorpay
const createTransactionService = async (
  transactionBody: any,
  razorpayData: any,
  refId: any,
) => {
  // config for axios
  const config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://api.razorpay.com/v1/payment_links/",
    headers: {
      "Content-type": "application/json",
      Authorization: `Basic ${process.env.RAZORPAY_KEY}`,
    },
    data: razorpayData,
  };
  // create transaction in razorpay api
  const response: any = await axios(config);
  const body: any = { ...transactionBody };
  body.paymentId = response.data.id;
  body.transactionId = refId;
  body.status = response.data.status === "paid" ? "success" : "pending";
  return {
    transaction: await Transaction.create(body),
    razorpayData: response.data,
  };
};

const updateTransactionService = async (
  transactionId: any,
  transactionBody: any,
) => {
  const transaction = await Transaction.findByIdAndUpdate(
    transactionId,
    transactionBody,
    {
      new: true,
    },
  );
  await updateTransactionFromRazorpayService(transactionId);
  return transaction;
};

const refreshTransactionService = async (transactionId: any) => {
  const transaction: any = await Transaction.findOne({
    transactionId: transactionId,
  });
  if (transaction && transaction.paymentId) {
    await updateTransactionFromRazorpayService(transactionId);
  }
};

// update pending transaction from razorpay api
const updateTransactionFromRazorpayService = async (transactionId: any) => {
  // get transaction from db if exists (return if success or failed)
  const transaction: any = await Transaction.findOne({
    transactionId: transactionId,
  });
  if (!transaction.paymentId) {
    return;
  }
  if (transaction.status === "success" || transaction.status === "failed") {
    return;
  }

  // config for axios
  const config: any = {
    method: "get",
    url: `https://api.razorpay.com/v1/payment_links/${transaction.paymentId}`,
    headers: {
      Authorization: `Basic ${process.env.RAZORPAY_KEY}`,
    },
  };
  const response: any = await axios(config);

  // update transaction status in db if paid
  if (response.data.status === "paid") {
    const user = await User.findById(transaction.userId);
    if (user) {
      transaction.status = "success";
      await User.findByIdAndUpdate(
        transaction.userId,
        {
          coins: user.coins + Number(transaction.coins),
        },
        { new: true },
      );
      await createPaymentLogService({
        logType: "COINS_ADDED",
        userId: new ObjectId(user._id),
        amount: transaction.amount,
        coins: transaction.coins,
        description: `${user.name} successfully added ${transaction.coins} coins to his account via Razorpay`,
      });
    }
    return await transaction.save();
  } else if (
    response.data.status === "expired" ||
    response.data.status === "cancelled"
  ) {
    transaction.status = "failed";
    return await transaction.save();
  }
};

export default {
  signUpService,
  findUserService,
  verifyToken,
  updateUserService,
  resetPasswordService,
  getAllUsersService,
  fetchEspekroIdService,
  addReferralCodeService,
  updatePrizeWinnerService,
  getTransactionByUserIdService,
  createTransactionService,
  updateTransactionService,
  refreshTransactionService,
};
