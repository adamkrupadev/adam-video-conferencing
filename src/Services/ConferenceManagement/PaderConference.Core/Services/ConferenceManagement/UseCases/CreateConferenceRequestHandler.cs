﻿using System;
using System.Threading;
using System.Threading.Tasks;
using HashidsNet;
using MediatR;
using PaderConference.Core.Domain.Entities;
using PaderConference.Core.Services.ConferenceManagement.Gateways;
using PaderConference.Core.Services.ConferenceManagement.Requests;

namespace PaderConference.Core.Services.ConferenceManagement.UseCases
{
    public class CreateConferenceRequestHandler : IRequestHandler<CreateConferenceRequest, string>
    {
        private readonly IConferenceRepo _conferenceRepo;

        public CreateConferenceRequestHandler(IConferenceRepo conferenceRepo)
        {
            _conferenceRepo = conferenceRepo;
        }

        public async Task<string> Handle(CreateConferenceRequest request, CancellationToken cancellationToken)
        {
            var data = request.Data;

            var id = GenerateId();
            var conference = new Conference(id) {Permissions = data.Permissions, Configuration = data.Configuration};

            try
            {
                await _conferenceRepo.Create(conference);
            }
            // ReSharper disable once RedundantCatchClause
            catch (Exception e)
            {
                // todo: handle duplicate ids, 
                throw;
            }

            return id;
        }

        private static string GenerateId()
        {
            var guid = Guid.NewGuid();
            var id = Math.Abs(guid.GetHashCode());

            return new Hashids("PaderConference").Encode(id);
        }
    }
}
