const MoneyBox= require(`${__dirname}/../models/moneyBox`);

// to make sure moneybox already exist 
const getCashBox = async (userId, session = null) => {
    let box;

    if (session) {
        box = await MoneyBox.findOne({ createdBy: userId }).session(session);
    } else {
        box = await MoneyBox.findOne({ createdBy: userId });
    }

    if (!box) {
        const created = await MoneyBox.create([{
            createdBy: userId
        }], session ? { session } : {});

        box = created[0];
    }

    return box;
};
module.exports = { getCashBox };

