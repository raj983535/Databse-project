import { asyncHandler } from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import { channel } from "diagnostics_channel"


// generating methods for access and refreshtoken 
// const generateAccessAndRefreshTokens = async (userId)=>{
//     try {
//         const user = await User.findById(userId)
//         const accessToken = user.generateAccessToken()
//         const refreshToken = user.generateRefreshToken()

//         user.refreshToken = refreshToken
//         await user.save({ validateBeforeSave:false })

//         return { accessToken , refreshToken}


//     } catch (error) {
//         throw new ApiError(500,"something went wrong while generating refresh and access token")
//     }
// }

//new

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)

        if (!user) {
            throw new Error("User not found")
        }

        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }

    } catch (error) {
        console.log("REAL ERROR:", error);
        throw new Error("something went wrong while generating refresh and access token")
    }
}

// user registration complete flow with alogorithm

const registerUser = asyncHandler( async (req,res) => {
    // steps to define Register user
    // get user from frontend
    // validation -> not empty
    // check if user already exists -> through email & username
    // check for images, check for avatar
    // upload them cloudinary, avatar
    // create user object -> create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return response


    // extract all the data points from the request.body
    const {username, fullname, email, password } = req.body
    // console.log("email:", email);


    //validates all the above data
    if(
        [fullname,email,username,password].some((field)=>field?.trim()==="")
    ){
        throw new ApiError(400,"All fields are required")
    }


    //check that if user already exists with the email or username 
    const existedUser = await User.findOne({
        $or: [ {username} , {email} ]
    })


    //if exists then throw error
    if(existedUser){
        throw new ApiError(409,"User with email or username already exists")
    }


    //find the local path of the cover image
    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path


    //valideates the coverImage logic that what if it not exists
    let coverImageLocalPath
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }


    // if avatar is not find then throw error
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    // console.log(req.files); 

    // if avatar is find then upload on the cloudinary because avatar is menditory field
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)


    //if avatar is not uploaded then throw an error
    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }

    // if everything is good then create an object and return it

        const user = await User.create({
        fullname,
        avatar:avatar.url,
        coverImage:coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
    })

    // remove the password and refreshtoken from the user (see in later)

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )


    // throw error if User is not created
    if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering a user")
    }


    // if created then show successfully
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

} )

//user login complete flow with alogorithm
const loginUser = asyncHandler(async (req,res) =>{

    // steps to define login user
    // collect data from req body
    // username or email (for login)
    // find the user
    //  password check
    //  access and refresh token generate
    //  send cookies and send response successfully


    //collect data from request body
    const {email, username, password} = req.body

    // check if username or email is present or nor
    if(!(username || email)){
        throw new ApiError(400, "username or email is required")
    }

    //find user by it's email or username (that confirms , he/she is registered)
    const user = await User.findOne({
        $or:[{username},{email}]
    })

    // if user is not find means not registeered
    if(!user){
        throw new ApiError(404,"user does not exist")
    }

    // if user found then check the password
    // note:- here we use user(small u) because it our operation, not mongodb when mongodb operations does then we will use User (like findOne, findById etc..)

    const isPasswordValid = await user.isPasswordCorrect(password)

    // validate the password
    if(!isPasswordValid){
        throw new ApiError(401,"Invalid user credentials")
    }

    //now generate the access and generate token

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    

    const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken")

    // send it into cookies

    const options = {
        httpOnly:true,
        secure:true
    }

    // send response to user or frontend

    return res
    .status(200)
    .cookie("accessToken",accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )

})

// LogOut the user

const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        },
        {
            new:true
        }
    )


    const options = {
        httpOnly:true,
        secure:true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))
})

// refresh the token, so that user does not need to login again and again

const refreshAccessToken = asyncHandler(async (req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401,"Invalid refresh token")
        }
    
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401,"refresh token is expired or used")
    
        }
    
    
        const options = {
            httpOnly:true,
            secure:true
        }
    
        const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200,
                {accessToken , refreshToken:newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh Token")
    }

}) 

// code for change the password of a user

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
       throw new ApiError(400,"Invalid old password")
    }

    // set the new password and save 
    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200, {}, "password changed successfully"))

})

// code for getting the current user
const getCurrentUser = asyncHandler(async (req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "current user fetched successfully"))
})

//code for update the user detailes
const updateAccountDetails = asyncHandler(async (req,res)=>{
    const {fullname,email} = req.body

    if(!fullname || !email){
        throw new ApiError(400,"All fields are required")
    }

    const user = await User.findByIdAndUpdate( 
        req.user?._id,
        {
            $set:{
                fullName,
                email,
            }
        },
        {new:true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse (200, user, "Account detailes updated successfully"))
    
})

//code for changing the avatar files
const updateUserAvatar = asyncHandler(async (req,res)=>{
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400, "error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "avatar upadted successfully")
    )
})

//code for changing the coverImage files
const updateUserCoverImage = asyncHandler(async (req,res)=>{
    const CoverImageLocalPath = req.file?.path

    if(!CoverImageLocalPath){
        throw new ApiError(400, "coverImage file is missing")
    }

    const coverImage = await uploadOnCloudinary(CoverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400, "error while uploading on coverImage")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },
        {new : true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "coverImage upadted successfully")
    )
})


// all about channel profile
const getUserChannelProfile = asyncHandler(async (req,res)=>{
    const {username} = req.params

    if(!username){
        throw new ApiError(400,"username is missing")
    }

    const Channel = await User.aggregate([
        {
            $match:{
                username:username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
        }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
        }  
        },
        {
            $addFields:{
                subscribersCount:{
                    $size:"$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                subscribersCount:1,
                channelsSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
        }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404,"channel does not exists")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(200,channel[0],"user channel fetched successfully")
    )
})

// export all the controllers
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile
}







