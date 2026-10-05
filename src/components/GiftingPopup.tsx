import Popup from "@/components/Popup";
import {ComponentProps} from "react";

export const GiftingPopup = (props: ComponentProps<typeof Popup>) => {
    return (
        <Popup {...props} title="Gifting">
            Well aren't you generous? Select who you'd like to gift your pixel to:
        </Popup>
    );
};
