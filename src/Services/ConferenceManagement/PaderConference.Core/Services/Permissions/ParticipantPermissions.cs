﻿using System.Threading.Tasks;
using PaderConference.Core.Services.Permissions.Gateways;

namespace PaderConference.Core.Services.Permissions
{
    public class ParticipantPermissions : IParticipantPermissions
    {
        private readonly IAggregatedPermissionRepository _permissionsRepo;

        public ParticipantPermissions(IAggregatedPermissionRepository permissionsRepo)
        {
            _permissionsRepo = permissionsRepo;
        }

        public async ValueTask<IPermissionStack> FetchForParticipant(Participant participant)
        {
            return new RepositoryPermissionStack(_permissionsRepo, participant);
        }
    }
}
