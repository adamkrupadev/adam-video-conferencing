﻿using System.Threading.Tasks;
using PaderConference.Core.Interfaces.Gateways.Repositories;
using PaderConference.Core.Services.ConferenceControl.Gateways;
using PaderConference.Core.Services.Synchronization;

namespace PaderConference.Core.Services.ConferenceControl
{
    public class SynchronizedConferenceInfoProvider : SynchronizedObjectProviderForAll<SynchronizedConferenceInfo>
    {
        private readonly IConferenceRepo _conferenceRepo;
        private readonly IConferenceScheduler _scheduler;
        private readonly IOpenConferenceRepository _openConferenceRepository;

        public SynchronizedConferenceInfoProvider(IConferenceRepo conferenceRepo, IConferenceScheduler scheduler,
            IOpenConferenceRepository openConferenceRepository)
        {
            _conferenceRepo = conferenceRepo;
            _scheduler = scheduler;
            _openConferenceRepository = openConferenceRepository;
        }

        public static SynchronizedObjectId SynchronizedObjectId { get; } = new(SynchronizedObjectIds.CONFERENCE);

        public override string Id { get; } = SynchronizedObjectIds.CONFERENCE;

        protected override async ValueTask<SynchronizedConferenceInfo> InternalFetchValue(string conferenceId)
        {
            var conference = await _conferenceRepo.FindById(conferenceId);
            if (conference == null) throw new ConferenceNotFoundException(conferenceId);

            var nextDate = _scheduler.GetNextExecution(conference.Configuration);
            var isOpen = await _openConferenceRepository.IsOpen(conferenceId);
            return new SynchronizedConferenceInfo(isOpen, conference.Configuration.Moderators, nextDate);
        }
    }
}
