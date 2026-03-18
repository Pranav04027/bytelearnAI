import { prisma } from "../db/index.js";

const toggleSubscription = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    if (!channelId) {
      return res.status(400).json({ success: false, message: "could not retrive channelId from params" });
    }

    //Check if Subscription Already exists
    const subscription = await prisma.subscription.findFirst({
      where: {
        subscriberId: req.user.id,
        channelId: channelId,
      },
    });

    if (subscription) {
      try {
        await prisma.subscription.delete({
          where: { id: subscription.id }
        });
      } catch (error) {
        return res.status(400).json({ success: false, message: "Some problem occurred while unsubscribing" });
      }
    } else {
      // Not subscribed → subscribe
      try {
        await prisma.subscription.create({
          data: {
            subscriberId: req.user.id,
            channelId: channelId,
          }
        });
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Error while subscribing to channel: ${error.message}`
        });
      }
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {},
      message: "Done"
    });
  } catch (err) {
    next(err);
  }
};

// controller to return subscriber list of a channel
const getUserChannelSubscribers = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    if (!channelId) {
      return res.status(400).json({ success: false, message: "could not retrive channelId from params" });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { channelId: channelId },
      include: {
        subscriber: {
          select: {
            id: true,
            username: true,
            fullname: true,
            email: true,
            avatar: true,
          }
        }
      }
    });
    
    // Map to just return the user objects, similar to what the aggregate pipeline did
    const subscribers = subscriptions.map(sub => sub.subscriber);

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: subscribers,
        message: "Successfully retrived Subscribers List"
      });
  } catch (err) {
    next(err);
  }
};

// controller to return channel list to which user has subscribed
const getSubscribedChannels = async (req, res, next) => {
  try {
    const { subscriberId } = req.params;
    if (!subscriberId) {
      return res.status(400).json({ success: false, message: "could not retrive subscriberId from params" });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: { subscriberId: subscriberId },
      include: {
        channel: {
          select: {
            id: true,
            username: true,
            fullname: true,
            email: true,
            avatar: true,
          }
        }
      }
    });

    // Map to just return channel user objects
    const subscribedChannels = subscriptions.map(sub => sub.channel);

    return res
      .status(200)
      .json({
        success: true,
        statusCode: 200,
        data: subscribedChannels,
        message: "Successfully retrived channel List"
      });
  } catch (err) {
    next(err);
  }
};

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
