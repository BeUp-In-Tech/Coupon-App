import { IDeal } from "../../modules/deal/v1/deal.interface";
import { workerLogger } from "../../utils/logger/logger.child";
import { dealHandleQueue } from "../index.queue";
import { JobName } from "../worker/deal.worker";

const queuedLogger = workerLogger.child({
  queue: 'dealHandleQueue',
  job: 'scheduleDealJobs',
});

export const scheduleDealJobs = async (deal: IDeal) => {
  const expireTime = new Date(deal.promotedUntil as Date).getTime();
  const now = Date.now();

  const oneDayBefore = expireTime - 24 * 60 * 60 * 1000;
  const oneHourBefore = expireTime - 60 * 60 * 1000;

  const jobs = [
    {
      name: JobName.DEAL_REMINDER_DAY,
      delay: oneDayBefore - now,
      jobId: `${deal._id?.toString()}-${JobName.DEAL_REMINDER_DAY}`
    },
    {
      name: JobName.DEAL_REMINDER_HOUR,
      delay: oneHourBefore - now,
      jobId: `${deal._id?.toString()}-${JobName.DEAL_REMINDER_HOUR}`
    },
    {
      name: JobName.DEAL_EXPIRE,
      delay: expireTime - now,
      jobId: `${deal._id?.toString()}-${JobName.DEAL_EXPIRE}`
    },
  ];  

  for (const job of jobs) {
    if (job.delay > 0) {
      await dealHandleQueue.add(
        job.name,
        { dealId: deal._id?.toString() },
        {
          delay: job.delay,
          jobId: job.jobId,
          removeOnComplete: true,
          removeOnFail: 100,
        }
      );

      queuedLogger.info(
        {
          jobName: job.name,
          jobId: job.jobId,
          delaySeconds: Math.round(job.delay / 1000),
        },
        'Deal queue job scheduled'
      );
      
    }
  }

  queuedLogger.info(
    { dealId: deal._id?.toString(), title: deal.title },
    'Deal update job schedule registered'
  );
  
};
