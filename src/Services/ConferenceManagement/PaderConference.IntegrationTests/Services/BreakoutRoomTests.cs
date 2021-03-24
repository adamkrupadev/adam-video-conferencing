﻿using System;
using System.Linq;
using System.Threading.Tasks;
using MediatR;
using Microsoft.AspNetCore.JsonPatch;
using Microsoft.AspNetCore.SignalR.Client;
using PaderConference.Core.Interfaces;
using PaderConference.Core.Services.BreakoutRooms;
using PaderConference.Core.Services.Rooms;
using PaderConference.Hubs.Core;
using PaderConference.Hubs.Core.Dtos;
using PaderConference.IntegrationTests._Helpers;
using Xunit;
using Xunit.Abstractions;

namespace PaderConference.IntegrationTests.Services
{
    [Collection(IntegrationTestCollection.Definition)]
    public class BreakoutRoomTests : ServiceIntegrationTest
    {
        public BreakoutRoomTests(ITestOutputHelper testOutputHelper, MongoDbFixture mongoDb) : base(testOutputHelper,
            mongoDb)
        {
        }

        [Fact]
        public async Task OpenBreakoutRooms_NoAssignments_UpdateSyncObjAndCreateRooms()
        {
            const string description = "hello world";
            const int amount = 5;

            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            // act
            await connection.Hub.InvokeAsync(nameof(CoreHub.OpenBreakoutRooms),
                new OpenBreakoutRoomsDto(amount, null, description, null));

            // assert
            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value =>
                {
                    Assert.NotNull(value.Active);

                    Assert.Equal(description, value.Active?.Description);
                    Assert.Null(value.Active?.Deadline);
                    Assert.Equal(amount, value.Active?.Amount);
                });

            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId, value =>
                {
                    Assert.Equal(amount + 1, value.Rooms.Count);
                });
        }

        [Fact]
        public async Task OpenBreakoutRooms_AssignParticipants_MoveParticipantsToRooms()
        {
            const string description = "hello world";
            const int amount = 2;

            // arrange
            var (connection, conference) = await ConnectToOpenedConference();

            var user1 = CreateUser();
            var user2 = CreateUser();

            await ConnectUserToConference(user1, conference);
            await ConnectUserToConference(user2, conference);

            var assignments = new[] {new[] {user1.Sub}, new[] {user2.Sub}};

            // act
            await connection.Hub.InvokeAsync(nameof(CoreHub.OpenBreakoutRooms),
                new OpenBreakoutRoomsDto(amount, null, description, assignments));

            // assert
            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId, value =>
                {
                    Assert.Equal(value.Participants[user1.Sub],
                        value.Rooms.First(x => x.DisplayName == "Alpha").RoomId);
                    Assert.Equal(value.Participants[user2.Sub],
                        value.Rooms.First(x => x.DisplayName == "Bravo").RoomId);
                });
        }

        [Fact]
        public async Task OpenBreakoutRooms_WithDeadline_AutomaticallyCloseBreakoutRooms()
        {
            const string description = "hello world";
            const int amount = 2;

            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            // act
            var deadline = DateTimeOffset.UtcNow.AddMilliseconds(200);
            await connection.Hub.InvokeAsync(nameof(CoreHub.OpenBreakoutRooms),
                new OpenBreakoutRoomsDto(amount, deadline, description, null));

            // assert
            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.NotNull(value.Active); });
            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.Null(value.Active); });
        }

        [Fact]
        public async Task CloseBreakoutRooms_NotOpened_NoError()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            // act
            var result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.CloseBreakoutRooms));

            // assert
            AssertSuccess(result);
        }

        [Fact]
        public async Task CloseBreakoutRooms_Opened_UpdateSyncObj()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            await connection.Hub.InvokeAsync(nameof(CoreHub.OpenBreakoutRooms),
                new OpenBreakoutRoomsDto(5, null, "hello world", null));
            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.NotNull(value.Active); });

            // act
            var result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.CloseBreakoutRooms));

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.Null(value.Active); });
        }

        [Fact]
        public async Task CloseBreakoutRooms_Opened_CloseRooms()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            await connection.Hub.InvokeAsync(nameof(CoreHub.OpenBreakoutRooms), DefaultConfig);
            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId, value => { Assert.True(value.Rooms.Count > 1); });

            // act
            var result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.CloseBreakoutRooms));

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId, value => { Assert.Equal(1, value.Rooms.Count); });
        }

        private static readonly OpenBreakoutRoomsDto DefaultConfig = new(4, null, null, null);

        [Fact]
        public async Task PatchBreakoutRooms_IncreaseRooms_CreateRooms()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            var result =
                await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.OpenBreakoutRooms),
                    DefaultConfig);
            AssertSuccess(result);

            var patch = new JsonPatchDocument<BreakoutRoomsConfig>();
            patch.Add(x => x.Amount, DefaultConfig.Amount + 2);

            // act
            result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.ChangeBreakoutRooms), patch);

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId,
                value => { Assert.Equal(DefaultConfig.Amount + 3, value.Rooms.Count); });
        }

        [Fact]
        public async Task PatchBreakoutRooms_DecreaseRooms_RemoveRooms()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            var result =
                await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.OpenBreakoutRooms),
                    DefaultConfig);
            AssertSuccess(result);

            var patch = new JsonPatchDocument<BreakoutRoomsConfig>();
            patch.Add(x => x.Amount, DefaultConfig.Amount - 2);

            // act
            result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.ChangeBreakoutRooms), patch);

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedRooms>(
                SynchronizedRoomsProvider.SynchronizedObjectId,
                value => { Assert.Equal(DefaultConfig.Amount - 1, value.Rooms.Count); });
        }

        [Fact]
        public async Task PatchBreakoutRooms_ChangeDescription_UpdateSyncObj()
        {
            const string description = "yo wtf";

            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            var result =
                await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.OpenBreakoutRooms),
                    DefaultConfig);
            AssertSuccess(result);

            var patch = new JsonPatchDocument<BreakoutRoomsConfig>();
            patch.Add(x => x.Description, description);

            // act
            result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.ChangeBreakoutRooms), patch);

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId,
                value => { Assert.Equal(description, value.Active?.Description); });
        }

        [Fact]
        public async Task PatchBreakoutRooms_CreateDeadline_CloseRoomsAfterDeadline()
        {
            // arrange
            var (connection, _) = await ConnectToOpenedConference();

            var result =
                await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.OpenBreakoutRooms),
                    DefaultConfig);
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.NotNull(value.Active); });

            var patch = new JsonPatchDocument<BreakoutRoomsConfig>();
            patch.Add(x => x.Deadline, DateTimeOffset.UtcNow.AddMilliseconds(200));

            // act
            result = await connection.Hub.InvokeAsync<SuccessOrError<Unit>>(nameof(CoreHub.ChangeBreakoutRooms), patch);

            // assert
            AssertSuccess(result);

            await connection.SyncObjects.AssertSyncObject<SynchronizedBreakoutRooms>(
                SynchronizedBreakoutRoomsProvider.SyncObjId, value => { Assert.Null(value.Active); });
        }
    }
}
