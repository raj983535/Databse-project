import { asyncHandler } from "../utils/asyncHandler.js"

const registerUser = asyncHandler( async (req,res) => {
    res.status(200).json({
        messsage:"chai aur code"
    })
} )

export {registerUser}

