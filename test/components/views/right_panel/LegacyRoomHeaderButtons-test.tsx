/*
Copyright 2024 New Vector Ltd.
Copyright 2022, 2023 The Matrix.org Foundation C.I.C.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { render, waitFor } from "@testing-library/react";
import {
    MatrixEvent,
    MsgType,
    RelationType,
    NotificationCountType,
    Room,
    MatrixClient,
    PendingEventOrdering,
    ReceiptType,
} from "matrix-js-sdk/src/matrix";
import React from "react";

import LegacyRoomHeaderButtons from "../../../../src/components/views/right_panel/LegacyRoomHeaderButtons";
import { MatrixClientPeg } from "../../../../src/MatrixClientPeg";
import { mkEvent, stubClient } from "../../../test-utils";
import { mkThread } from "../../../test-utils/threads";

describe("LegacyRoomHeaderButtons-test.tsx", function () {
    const ROOM_ID = "!roomId:example.org";
    let room: Room;
    let client: MatrixClient;

    beforeEach(() => {
        jest.clearAllMocks();

        stubClient();
        client = MatrixClientPeg.safeGet();
        client.supportsThreads = () => true;
        room = new Room(ROOM_ID, client, client.getUserId() ?? "", {
            pendingEventOrdering: PendingEventOrdering.Detached,
        });
    });

    function getComponent(room?: Room) {
        return render(<LegacyRoomHeaderButtons room={room} excludedRightPanelPhaseButtons={[]} />);
    }

    function getThreadButton(container: HTMLElement) {
        return container.querySelector(".mx_RightPanel_threadsButton");
    }

    function isIndicatorOfType(container: HTMLElement, type: "highlight" | "notification" | "activity") {
        return container.querySelector(".mx_RightPanel_threadsButton .mx_Indicator")!.className.includes(type);
    }

    it("should render", () => {
        const { asFragment } = getComponent(room);
        expect(asFragment()).toMatchSnapshot();
    });

    it("shows the thread button", () => {
        const { container } = getComponent(room);
        expect(getThreadButton(container)).not.toBeNull();
    });

    it("room wide notification does not change the thread button", () => {
        room.setUnreadNotificationCount(NotificationCountType.Highlight, 1);
        room.setUnreadNotificationCount(NotificationCountType.Total, 1);

        const { container } = getComponent(room);

        expect(container.querySelector(".mx_RightPanel_threadsButton .mx_Indicator")).toBeNull();
    });

    it("thread notification does change the thread button", async () => {
        const { container } = getComponent(room);
        expect(getThreadButton(container)!.className.includes("mx_LegacyRoomHeader_button--unread")).toBeFalsy();

        room.setThreadUnreadNotificationCount("$123", NotificationCountType.Total, 1);
        await waitFor(() => {
            expect(getThreadButton(container)!.className.includes("mx_LegacyRoomHeader_button--unread")).toBeTruthy();
            expect(isIndicatorOfType(container, "notification")).toBe(true);
        });

        room.setThreadUnreadNotificationCount("$123", NotificationCountType.Highlight, 1);
        await waitFor(() => expect(isIndicatorOfType(container, "highlight")).toBe(true));

        room.setThreadUnreadNotificationCount("$123", NotificationCountType.Total, 0);
        room.setThreadUnreadNotificationCount("$123", NotificationCountType.Highlight, 0);

        await waitFor(() => expect(container.querySelector(".mx_RightPanel_threadsButton .mx_Indicator")).toBeNull());
    });

    it("thread activity does change the thread button", async () => {
        const { container } = getComponent(room);

        // Thread activity should appear on the icon.
        const { rootEvent, events } = mkThread({
            room,
            client,
            authorId: client.getUserId()!,
            participantUserIds: ["@alice:example.org"],
            length: 5,
        });
        // We need some receipt, otherwise we treat this thread as
        // "older than all threaded receipts" and consider it read.
        let receipt = new MatrixEvent({
            type: "m.receipt",
            room_id: room.roomId,
            content: {
                [events[1].getId()!]: {
                    // Receipt for the first event in the thread
                    [ReceiptType.Read]: {
                        [client.getUserId()!]: { ts: 1, thread_id: rootEvent.getId() },
                    },
                },
            },
        });
        room.addReceipt(receipt);
        await waitFor(() => expect(isIndicatorOfType(container, "activity")).toBe(true));

        // Sending the last event should clear the notification.
        let event = mkEvent({
            event: true,
            type: "m.room.message",
            user: client.getUserId()!,
            room: room.roomId,
            content: {
                "msgtype": MsgType.Text,
                "body": "Test",
                "m.relates_to": {
                    event_id: rootEvent.getId(),
                    rel_type: RelationType.Thread,
                },
            },
        });
        room.addLiveEvents([event]);
        await waitFor(() => expect(container.querySelector(".mx_RightPanel_threadsButton .mx_Indicator")).toBeNull());

        // Mark it as unread again.
        event = mkEvent({
            event: true,
            type: "m.room.message",
            user: "@alice:example.org",
            room: room.roomId,
            content: {
                "msgtype": MsgType.Text,
                "body": "Test",
                "m.relates_to": {
                    event_id: rootEvent.getId(),
                    rel_type: RelationType.Thread,
                },
            },
        });
        room.addLiveEvents([event]);
        await waitFor(() => expect(isIndicatorOfType(container, "activity")).toBe(true));

        // Sending a read receipt on an earlier event shouldn't do anything.
        receipt = new MatrixEvent({
            type: "m.receipt",
            room_id: room.roomId,
            content: {
                [events.at(-1)!.getId()!]: {
                    [ReceiptType.Read]: {
                        [client.getUserId()!]: { ts: 1, thread_id: rootEvent.getId() },
                    },
                },
            },
        });
        room.addReceipt(receipt);
        await waitFor(() => expect(isIndicatorOfType(container, "activity")).toBe(true));

        // Sending a receipt on the latest event should clear the notification.
        receipt = new MatrixEvent({
            type: "m.receipt",
            room_id: room.roomId,
            content: {
                [event.getId()!]: {
                    [ReceiptType.Read]: {
                        [client.getUserId()!]: { ts: 1, thread_id: rootEvent.getId() },
                    },
                },
            },
        });
        room.addReceipt(receipt);
        await waitFor(() => expect(container.querySelector(".mx_RightPanel_threadsButton .mx_Indicator")).toBeNull());
    });
});
